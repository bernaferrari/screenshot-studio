// Screenshot Studio renderer. One card per page: preview.html?locale=de-DE&kind=phone&slide=0[&fit]
// The app supplies ../studio.json, ../profiles.json, ../gallery.json (layout), ../theme.css,
// ../theme.js, and per locale ../<locale>/copy.json (words) and ../<locale>/raw/ (captures).
import {cardsFor, devicesFor, withCopy, nodesFile, followCallout, withoutMeta} from '../core/gallery';
import type {BoundsRule, Box, Callout, Card, CardReport, Copy, DeviceSpec, Galleries, Profiles, StudioConfig, Theme, ThemeContext, UiTree} from '../core/types';

const q = new URLSearchParams(location.search);
// A README strip renders a card as first, middle, last or only of a run, so themes can hide art that sits on the
// strip's outer seams (html[data-strip="last"] .seam-right, say).
if (q.get('strip')) document.documentElement.dataset.strip = q.get('strip')!;
async function json<T>(file: string): Promise<T>;
async function json<T>(file: string, optional: true): Promise<T | null>;
async function json<T>(file: string, optional = false): Promise<T | null> {
  const response = await fetch(file);
  if (!response.ok) {
    if (optional) return null;
    throw new Error(`Cannot load ${file}`);
  }
  return withoutMeta(await response.json());
}
const config = await json<StudioConfig>('../studio.json');
const defaultLocale = config.defaultLocale || 'en-US';
const locale = q.get('locale') || defaultLocale;
const [galleries, profiles, copy, defaultCopy] = await Promise.all([json<Galleries>('../gallery.json'), json<Profiles>('../profiles.json'),
  json<Copy>(`../${locale}/copy.json`, true), json<Copy>(`../${defaultLocale}/copy.json`, true)]);
const kind = q.get('kind') || Object.keys(galleries)[0];
const profile = profiles[kind];
if (!profile) throw new Error(`No profile for ${kind}`);
const words = (cards: Card[]) => cards.map(card => withCopy(card, kind, copy || {}, locale === defaultLocale ? {} : defaultCopy || {}).card);
const slides = words(cardsFor(galleries, kind));
const index = Math.max(0, Math.min(slides.length - 1, Number(q.get('slide') || 0)));
const {card: slide, missing} = withCopy(cardsFor(galleries, kind)[index], kind, copy || {}, locale === defaultLocale ? {} : defaultCopy || {});
// Everything that fell back to the default locale is reported to the editor and the exporter.
const report: CardReport = {locale, missingCopy: copy ? missing : ['copy.json'], fallbackCaptures: [], movedCallouts: [], fixedCallouts: [], fit: 1};
const W = profile.width, H = profile.height;
// The app's theme sits beside the studio folder and loads at runtime (the build keeps it external).
const theme: Theme = (await import(/* @vite-ignore */ '../theme.js' as string)).default || {};

const root = document.documentElement;
root.lang = locale;
root.dir = (config.rtl || []).includes(locale) ? 'rtl' : 'ltr';
root.classList.add(kind, `frame-${profile.frame || 'phone'}`, W > H ? 'landscape' : 'portrait');
root.style.setProperty('--canvas-width', `${W}px`);
root.style.setProperty('--canvas-height', `${H}px`);
for (const [name, value] of Object.entries(slide.vars || {})) root.style.setProperty(name, value);

const main = document.createElement('main');
main.className = `campaign ${slide.feature} ${slide.layout || ''}`.trim();
main.innerHTML = '<svg class="art" aria-hidden="true"></svg>';
document.body.append(main);

// Headline markup shared by every app: *highlight*, ~struck out~, [inserted], \n for a new line.
if (slide.title) {
  const header = document.createElement('header');
  header.innerHTML = '<h1></h1><p></p>';
  const h1 = header.querySelector('h1')!;
  for (const text of slide.title.split('\n')) {
    const line = document.createElement('span');
    line.className = 'line';
    for (const part of text.split(/(\*[^*]+\*|~[^~]+~|\[[^\]]+\])/).filter(Boolean)) {
      const tag = ({'*': 'em', '~': 'del', '[': 'ins'} as Record<string, string>)[part[0]];
      if (tag && part.length > 2) {
        const node = document.createElement(tag);
        node.textContent = part.slice(1, -1);
        line.append(node);
      } else line.append(part);
    }
    h1.append(line);
  }
  if (slide.body) header.querySelector('p')!.textContent = slide.body;
  else header.querySelector('p')!.remove();
  main.append(header);
}
main.setAttribute('aria-label', slide.alt || `${slide.feature}: ${(slide.title || '').replace(/[*~[\]]/g, '').replaceAll('\n', ' ')}`);

// A capture comes from the locale's raw/ folder, or from the default locale's while it is missing.
const loadCapture = (img: HTMLImageElement, raw: string) => new Promise<string | null>(resolve => {
  img.onload = () => resolve(img.dataset.fallback ? defaultLocale : locale);
  img.onerror = () => {
    if (img.dataset.fallback) return resolve(null);
    img.dataset.fallback = 'true';
    report.fallbackCaptures.push(raw);
    img.src = `../${defaultLocale}/raw/${raw}`;
  };
  img.src = `../${locale}/raw/${raw}`;
});

interface Device {spec: DeviceSpec; node: HTMLElement; img: HTMLImageElement; loaded: Promise<string | null>; locale?: string | null}
const devices: Device[] = devicesFor(slide).map((spec, i) => {
  const frame = spec.frame || profile.frame || 'phone';
  const node = document.createElement('div');
  node.className = `device ${spec.role || (i === 0 ? 'primary' : `device-${i + 1}`)} device-frame-${frame}`;
  node.innerHTML = '<div class="screen"><img data-app-capture alt=""></div>';
  if (frame === 'browser') node.insertAdjacentHTML('beforeend', '<div class="dots"><i></i><i></i><i></i></div>');
  const img = node.querySelector('img')!;
  img.alt = spec.alt || `${slide.feature}: the real app with example data`;
  main.append(node);
  return {spec, node, img, loaded: loadCapture(img, spec.raw)};
});
const capture = devices[0]?.img;

// A README name banner: `"identity": true` (or {icon, name}) on a card swaps its headline for the app icon, the
// app's name and an optional tagline (the card's `tagline` copy, with *highlight*). studio.json "identity" sets the
// defaults: icon (from store-listing/, default brand/icon.png) and name (default "app").
const highlighted = (parent: HTMLElement, text: string) => text.split(/(\*[^*]+\*)/).filter(Boolean).forEach(part => parent.append(
  part.startsWith('*') ? Object.assign(document.createElement('em'), {textContent: part.slice(1, -1)}) : document.createTextNode(part)));
if (slide.identity) {
  const spec = {icon: 'brand/icon.png', name: config.app, ...config.identity, ...(typeof slide.identity === 'object' ? slide.identity : {})};
  main.querySelector('header')?.remove();
  const id = document.createElement('div');
  id.className = 'identity';
  id.dataset.checkBounds = '';
  const name = Object.assign(document.createElement('span'), {textContent: spec.name ?? ''});
  id.append(Object.assign(document.createElement('img'), {src: `../${spec.icon}`, alt: ''}), name);
  if (slide.tagline) {
    const small = document.createElement('small');
    highlighted(small, slide.tagline);
    id.append(small);
  }
  main.append(id);
}

const art = main.querySelector<SVGSVGElement>('.art')!;
art.setAttribute('viewBox', `0 0 ${W} ${H}`);
const context: ThemeContext = {W, H, kind, locale, defaultLocale, index, slide, slides, profile, profiles, config, main, art, capture};
if (theme.art) art.innerHTML = theme.art(context) || '';
if (theme.compose) await theme.compose(context);

const captureLocales = await Promise.all(devices.map(d => d.loaded));
devices.forEach((d, i) => { d.locale = captureLocales[i]; if (!d.locale) throw new Error(`Missing capture ${d.spec.raw}`); });
await Promise.all([...document.images].map(image => image.decode()));
await document.fonts.ready;
// A capture must keep a real device ratio: one of the configured capture sizes, in either orientation.
const ratios = Object.values(profiles).filter(p => p.captureWidth && p.captureHeight).flatMap(p => [p.captureWidth! / p.captureHeight!, p.captureHeight! / p.captureWidth!]);
for (const {img, spec} of devices) {
  const ratio = img.naturalWidth / img.naturalHeight;
  const own = spec.profile ? profiles[spec.profile] : null;
  const expected = own?.captureWidth && own.captureHeight ? own.captureWidth / own.captureHeight : null;
  if (expected ? Math.abs(ratio - expected) > .001 : !ratios.some(r => Math.abs(ratio - r) < .001))
    throw new Error(`Recapture ${spec.raw}: ${img.naturalWidth}×${img.naturalHeight} is not a configured device ratio`);
}

const relative = (element: Element): Box => {
  const canvas = main.getBoundingClientRect(), r = element.getBoundingClientRect();
  return {left: r.left - canvas.left, top: r.top - canvas.top, width: r.width, height: r.height};
};
// Layout words, the keys for per-layout settings below: the card's gallery kind, its feature and its `layout`
// classes (the classes its CSS selects on).
const layoutWords = [kind, slide.feature, ...(slide.layout || '').split(/\s+/).filter(Boolean)];
// Frames scale with their width: bezel and corner radius as fractions of the frame width, per frame (phone,
// tablet, browser) and for landscape captures in a phone or tablet frame. studio.json "frames" overrides any of
// them; "fixed" lists layouts whose CSS sizes its own frames; "frames": false turns scaling off.
type Ratio = {bezel: number; radius: number};
const FRAMES: Record<string, Ratio> & {fixed: string[]} = {phone: {bezel: .02, radius: .09}, tablet: {bezel: .018, radius: .05}, landscape: {bezel: .012, radius: .035}, fixed: [] as string[]} as never;
const frames = config.frames === false ? null : {...FRAMES, ...config.frames} as typeof FRAMES;
for (const d of devices) {
  const frame = d.spec.frame || profile.frame || 'phone';
  const landscape = d.img.naturalWidth > d.img.naturalHeight;
  d.node.classList.add(landscape ? 'device-landscape' : 'device-portrait');
  const ratio = frames && !layoutWords.some(w => frames.fixed.includes(w)) && frames[['phone', 'tablet'].includes(frame) && landscape ? 'landscape' : frame];
  if (!ratio || frame === 'none') continue;
  const width = d.node.clientWidth;
  d.node.style.setProperty('--bezel', `${Math.round(width * ratio.bezel)}px`);
  d.node.style.setProperty('--radius', `${Math.round(width * ratio.radius)}px`);
}
if (theme.layout) await theme.layout(context);
const measured = devices.map(d => ({...d, locale: d.locale ?? null, box: relative(d.node), screen: relative(d.node.querySelector('.screen')!)}));
context.devices = measured;
// A device may carry a label (a before/after pair, say): a caption centred above the frame, styled by the theme.
for (const {spec, box} of measured) {
  if (!spec.label) continue;
  const label = document.createElement('div');
  label.className = `device-label${spec.role ? ` ${spec.role}` : ''}`;
  label.dataset.checkBounds = '';
  // Labels take the headline's *highlight* markup.
  const span = document.createElement('span');
  highlighted(span, spec.label);
  label.append(span);
  Object.assign(label.style, {left: `${box.left}px`, width: `${box.width}px`, top: `${box.top}px`});
  // A theme can set a label under its frame instead: transform: translateY(calc(var(--device-height) + 30px)),
  // or under the card's tallest frame (--tallest-device), so a row of labels lines up.
  label.style.setProperty('--device-height', `${box.height}px`);
  label.style.setProperty('--tallest-device', `${Math.max(...measured.map(d => d.box.height))}px`);
  main.append(label);
}
context.device = measured[0]?.box;
context.screen = measured[0]?.screen;

// Callouts lift a region of a real capture out of its screen, centred where it lives. Boxes are drawn on
// the default locale's capture; in other locales they follow the same UI element through the layout sidecars.
// A callout may also come from another capture of the same scene (`raw`, e.g. a notification shade or a
// dialog), placed on the card with `place: {left, top, width}` in canvas pixels.
interface Source {img: HTMLImageElement; spec: {raw: string}; locale: string; screen?: Box}
const sources = new Map<string, Promise<Source>>();
const sourceFor = async (raw: string): Promise<Source> => {
  if (!sources.has(raw)) {
    const img = new Image();
    sources.set(raw, loadCapture(img, raw).then(async capturedIn => {
      if (!capturedIn) throw new Error(`Missing callout capture ${raw}`);
      await img.decode();
      return {img, spec: {raw}, locale: capturedIn};
    }));
  }
  return sources.get(raw)!;
};
for (const [ci, c] of (slide.callouts || [] as Callout[]).entries()) {
  const d: Source = c.raw ? await sourceFor(c.raw) : measured[c.device || 0] as Source;
  let box = {x: c.x, y: c.y, w: c.w, h: c.h, target: c.target, targetId: c.targetId, targetClass: c.targetClass, targetMode: c.targetMode};
  if (d.locale !== defaultLocale || c.targetMode === 'element') {
    const reference = await json<UiTree>(`../${defaultLocale}/raw/${nodesFile(d.spec.raw)}`, true);
    const localized = d.locale === defaultLocale ? reference : await json<UiTree>(`../${d.locale}/raw/${nodesFile(d.spec.raw)}`, true);
    const sizeMatches = localized?.width === d.img.naturalWidth && localized?.height === d.img.naturalHeight;
    const moved = c.targetMode === 'element' && !sizeMatches ? null : followCallout(box, reference, localized);
    if (moved) { box = {...box, ...moved}; if (d.locale !== defaultLocale) report.movedCallouts.push(ci); }
    else if (c.targetMode === 'element' && d.locale === defaultLocale) throw new Error(`The selected accessibility element is missing or incompatible in ${d.spec.raw}. Pick the element again.`);
    else report.fixedCallouts.push(ci);
  }
  let k: number, left: number, top: number;
  if (c.place) {
    k = c.place.width / box.w;
    left = c.place.left;
    top = c.place.top;
  } else {
    // Without a placement, a callout sits over the primary screen where its region lives.
    const screen = (d.screen || context.screen)!;
    const scale = screen.width / d.img.naturalWidth;
    k = scale * (c.mag || 1.1);
    left = screen.left + (box.x + box.w / 2) * scale + (c.dx || 0) - box.w * k / 2;
    top = screen.top + (box.y + box.h / 2) * scale + (c.dy || 0) - box.h * k / 2;
  }
  const el = document.createElement('div');
  el.className = `callout${c.role ? ` ${c.role}` : ''}`;
  el.dataset.checkBounds = '';
  Object.assign(el.style, {
    width: `${box.w * k}px`, height: `${box.h * k}px`, left: `${left}px`, top: `${top}px`,
    borderRadius: `${(c.radius || 0) * k}px`, backgroundImage: `url("${d.img.src}")`,
    backgroundSize: `${d.img.naturalWidth * k}px auto`, backgroundPosition: `${-box.x * k}px ${-box.y * k}px`
  });
  main.append(el);
}
if (theme.decorate) await theme.decorate(context);

// Device bounds. A frame keeps `margin` px from the sides and top, shows at least `visible` of itself, and a
// landscape screen in a phone or tablet frame is never cut at the top or bottom. studio.json "bounds" sets these and, under "layouts", per
// layout word, feature or gallery kind: {"sides": true} (may leave either side), {"right": true | 0.22} (may run off the
// right, by any amount or by a fraction of its width), {"top": true} (may hang from the top), {"cut": true}
// (landscape may be cut), {"visible": 0.45}, or false to skip the checks. A card's own "bounds" goes last.
{
  const {layouts: own, ...base} = {margin: 0, visible: .6, ...config.bounds};
  // The README spread's tablet runs off the right edge by design.
  const layouts: Record<string, BoundsRule | false> = {spread: {right: true}, ...own};
  const rules = [base, ...layoutWords.map(w => layouts[w]).filter(r => r !== undefined), slide.bounds].filter(r => r !== undefined);
  if (!rules.includes(false)) {
    const rule = Object.assign({}, ...rules) as {margin: number; visible: number; sides?: boolean; right?: boolean | number; top?: boolean; cut?: boolean};
    const m = rule.margin;
    for (const {box, spec} of measured) {
      const frame = spec.frame || profile.frame || 'phone';
      if (frame === 'none') continue;
      const overRight = box.left + box.width - (W - m);
      if (!rule.sides && (box.left < m - .5 || (overRight > .5 && !(rule.right === true || overRight / box.width <= (Number(rule.right) || 0)))))
        throw new Error(`Screen leaves the side of the card: ${spec.raw}`);
      if (!rule.top && box.top < m - .5) throw new Error(`Screen leaves the top of the card: ${spec.raw}`);
      if ((Math.min(box.top + box.height, H) - Math.max(box.top, 0)) / box.height < rule.visible) throw new Error(`Too little of ${spec.raw} is visible`);
      if (!rule.cut && ['phone', 'tablet'].includes(frame) && box.width > box.height && (box.top < -.5 || box.top + box.height > H + 1)) throw new Error(`Landscape tablet is cut: ${spec.raw}`);
    }
  }
}
// A theme with a background that runs across card seams says so (`continuous: true`, or a list of gallery kinds);
// the exporter then checks that neighbouring cards' touching edges match.
report.continuous = Array.isArray(theme.continuous) ? theme.continuous.includes(kind) : !!theme.continuous;

// Auto-fit: longer languages shrink the copy (never below config.minFit, 0.72 by default) until every
// headline line fits its column and the text clears the app views beside or below it.
const header = main.querySelector('header');
if (header) {
  const textBox = () => {
    const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let node; (node = walker.nextNode());) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) { l = Math.min(l, rect.left); t = Math.min(t, rect.top); r = Math.max(r, rect.right); b = Math.max(b, rect.bottom); }
    }
    return {l, t, r, b};
  };
  const blocks = [...main.querySelectorAll('.device:not(.device-frame-none)')].map(n => n.getBoundingClientRect());
  const fits = () => {
    if ([...header.querySelectorAll<HTMLElement>('h1 .line')].some(line => line.scrollWidth > line.parentElement!.clientWidth + 1)) return false;
    const t = textBox();
    if (t.l < -.5 || t.t < -.5 || t.r > W + .5 || t.b > H + .5) return false;
    return blocks.every(d => t.b + 16 <= d.top || t.t >= d.bottom || t.r + 16 <= d.left || t.l >= d.right);
  };
  const sizes = [...header.querySelectorAll<HTMLElement>('h1, p')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)] as const);
  const minFit = config.minFit || .72;
  for (let s = 1; !fits() && s > minFit - .001; s -= .02) {
    report.fit = Math.round(s * 100) / 100;
    for (const [el, size] of sizes) el.style.fontSize = `${size * s}px`;
    if (theme.refit) await theme.refit(context);
  }
  if (!fits()) report.fit = 0;
  // A short last line ("…all\nbuilt in.") reads as a mistake at thumbnail size: report it so the copy can be reworded.
  for (const el of header.querySelectorAll<HTMLElement>('h1 .line, p')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Map<number, {left: number; right: number}>();
    for (const rect of range.getClientRects()) {
      if (!rect.width) continue;
      const top = Math.round(rect.top / 4), line = lines.get(top);
      lines.set(top, line ? {left: Math.min(line.left, rect.left), right: Math.max(line.right, rect.right)} : {left: rect.left, right: rect.right});
    }
    const widths = [...lines.entries()].sort(([a], [b]) => a - b).map(([, l]) => l.right - l.left);
    if (widths.length > 1 && widths[widths.length - 1] < Math.max(...widths) * .3) {
      const words = el.textContent!.trim().split(/\s+/);
      (report.widows ||= []).push(words.slice(-2).join(' '));
    }
  }
}

if (q.has('fit')) {
  root.classList.add('fit-scene');
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    Object.assign(main.style, {transformOrigin: '0 0', transform: `scale(${s})`, left: `${(innerWidth - W * s) / 2}px`, top: `${(innerHeight - H * s) / 2}px`});
  };
  fit();
  addEventListener('resize', fit);
}
root.dataset.report = JSON.stringify(report);
root.dataset.ready = 'true';
