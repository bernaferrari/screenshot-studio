/**
 * Render every card to a store-ready image and check the composition (with Playwright, found wherever it is installed).
 *   npx screenshot-studio export [--locale de-DE] [--gallery phone] [--card home] [--strict] [--fastlane] [--jobs 4] [--json]
 * Without --locale every locale in studio.json is rendered. --strict fails when a non-default locale
 * still borrows default-locale words or captures, or a callout could not follow its UI element.
 * It also warns (and --strict fails) when a gallery folder holds images no card writes any more, when a
 * continuous background (theme `continuous`) breaks at a seam, and when <locale>/listing.json is over Play's
 * limits. --fastlane writes fastlane/metadata/android/<locale>/ text and screenshots (studio.json "fastlane").
 * --prune deletes images no card writes any more. --jobs sets how many cards render at once.
 * --json prints the result as JSON (for agents and tools); exportListing() returns the same result.
 */
import fs from 'node:fs';
import {outputProblems} from './outputs';
import os from 'node:os';
import path from 'node:path';
import type {Server} from 'node:http';
import type {Browser, Page} from 'playwright';
import type {Card, CardReport, Listing, ReadmeStrip} from '../core/types';
import {checkListing} from './check';
import {loadListing, oldNames, readJson, requireListing, type ListingFiles} from './project';
import {serve} from './server';
import {launchBrowser} from './playwright';
import {listingProblems, storeFor} from '../core/stores';
import {count} from '../core/layout';

export interface ExportOptions {
  /** The store-listing folder (default: the one this studio copy lives in). */
  listing?: string;
  /** Only these languages (default: every language in studio.json). */
  locales?: string[];
  /** Only this gallery (or `strips` for README strips). */
  gallery?: string;
  /** Only this card: its feature name, or its 0-based index (in `gallery`, or in every gallery). */
  card?: number | string;
  /** Warnings and borrowed words fail the export. */
  strict?: boolean;
  /** Also write fastlane / F-Droid metadata. */
  fastlane?: boolean;
  /** Delete images in the gallery folders that no card writes any more, instead of warning about them. */
  prune?: boolean;
  /** How many cards render at once (default: up to 4, one per CPU). */
  jobs?: number;
  /** Progress lines (default: console.log). */
  log?: (line: string) => void;
}

export interface ExportedCard {
  locale: string;
  kind: string;
  index: number;
  feature: string;
  /** Relative to the store-listing folder. */
  file: string;
  width: number;
  height: number;
  bytes: number;
  notes: string[];
  /** Where the devices, headline and callouts landed, in card pixels. */
  layout?: CardReport['layout'];
}

export interface LocaleTally {
  locale: string;
  cards: number;
  untranslated: number;
  borrowedCaptures: number;
  movedCallouts: number;
  fixedCallouts: number;
  shrunk: number;
}

export interface ExportResult {
  ok: boolean;
  cards: ExportedCard[];
  /** Problems a person would otherwise catch by eye. */
  warnings: string[];
  /** Why the export failed, when it did. */
  error?: string;
  locales: LocaleTally[];
}

const IMAGES = /\.(jpe?g|png|webp)$/i;

type Column = number[];
type Edges = [[Column, Column], [Column, Column]];

// The two pixel columns at each edge of a card, with the foreground hidden: the background alone, as RGB rows
// ([outer, inner] on the left, [inner, outer] on the right).
async function edgeColumns(page: Page, width: number, height: number): Promise<Edges> {
  await page.evaluate(() => { for (const el of document.querySelectorAll<HTMLElement>('.device, .device-3d, header, .callout, .device-label, .identity')) el.style.visibility = 'hidden'; });
  const shots: string[] = [];
  for (const x of [0, width - 2]) shots.push((await page.screenshot({type: 'png', scale: 'css', clip: {x, y: 0, width: 2, height}})).toString('base64'));
  return page.evaluate(shots => Promise.all(shots.map(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const {naturalWidth: w, naturalHeight: h} = image;
    const canvas = Object.assign(document.createElement('canvas'), {width: w, height: h});
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const px = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
    return [0, 1].map(x => { const column: number[] = []; for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) column.push(px[(y * w + x) * 4 + c]); return column; });
  })), shots) as Promise<Edges>;
}

// Neighbouring edges match when few rows differ visibly and the average difference stays small. A row may match the
// other side up to 4 rows away (a thin line crossing the seam at a slant) or one column further in (a hairline lying
// on the seam itself).
function seamBreak([leftInner, leftOuter]: [Column, Column], [rightOuter, rightInner]: [Column, Column]): number | null {
  let bad = 0, sum = 0;
  const rows = leftOuter.length / 3;
  const pairs = [[leftOuter, rightOuter], [leftOuter, rightInner], [leftInner, rightOuter]];
  for (let r = 0; r < rows; r++) {
    let d = Infinity;
    for (const [a, b] of pairs) for (let s = Math.max(0, r - 4); s <= Math.min(rows - 1, r + 4); s++)
      d = Math.min(d, Math.max(...[0, 1, 2].map(c => Math.abs(a[r * 3 + c] - b[s * 3 + c]))));
    sum += d;
    if (d > 24) bad++;
  }
  return bad / rows > .02 || sum / rows > 6 ? Math.round(bad / rows * 100) : null;
}

/** Below this contrast against what's behind it, text blends into the art: WCAG's bar for large text. */
const MIN_CONTRAST = 3;
/** How a card that timed out with no error ends its message. */
const NOT_READY = 'never became ready';

/**
 * Text the background swallows. Every piece of text on the card (each headline run, the body, labels, the name
 * banner, layers in front) is measured against the pixels actually behind it: the card is shot once more with the
 * text made transparent, keeping each element's own background, and the darkest-to-text tenth of those pixels must
 * still reach MIN_CONTRAST. Decorative layers behind the devices aren't text to read and are skipped.
 */
/** Text below this effective opacity is decoration, which the contrast check leaves alone. */
const FAINT = .3;

async function hardToRead(page: Page): Promise<{text: string; contrast: number}[]> {
  const targets = await page.evaluate(FAINT => {
    const ink = document.createElement('canvas').getContext('2d', {willReadFrequently: true})!;
    const rgba = (color: string) => { ink.clearRect(0, 0, 1, 1); ink.fillStyle = color; ink.fillRect(0, 0, 1, 1); return [...ink.getImageData(0, 0, 1, 1).data]; };
    const found: {text: string; color: number[]; boxes: {x: number; y: number; w: number; h: number}[]}[] = [];
    const main = document.querySelector('main');
    if (!main) return found;
    for (const element of main.querySelectorAll<HTMLElement>('*')) {
      // Art, devices, and text a reader isn't meant to read (aria-hidden) aren't copy.
      if (element.closest('.art, .device, .layer-behind, svg, [aria-hidden="true"]')) continue;
      const nodes = [...element.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      if (!nodes.length) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden') continue;
      let opacity = 1;
      for (let e: HTMLElement | null = element; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
      // Text is painted in its fill color, which is its color unless a theme sets -webkit-text-fill-color. A
      // transparent fill is gradient text, painted by its background: no one color to measure.
      const color = rgba(style.webkitTextFillColor || style.color);
      color[3] = color[3] / 255 * opacity;
      // Text this faint is decoration by design (a watermark, a big background glyph), not copy.
      if (color[3] < FAINT) continue;
      const boxes = nodes.flatMap(node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()]; })
        .filter(r => r.width > 2 && r.height > 2).map(r => ({x: r.x, y: r.y, w: r.width, h: r.height}));
      if (boxes.length) found.push({text: nodes.map(n => n.textContent!.trim()).join(' '), color, boxes});
    }
    return found;
  }, FAINT);
  if (!targets.length) return [];
  // Two screenshots: as it is, and with the text made transparent. Where they differ is ink; the second shows what is
  // behind it there.
  const inked = (await page.screenshot({type: 'png', scale: 'css'})).toString('base64');
  const style = await page.addStyleTag({content: 'main, main * {color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important}'});
  const shot = (await page.screenshot({type: 'png', scale: 'css'})).toString('base64');
  await style.evaluate(node => (node as Element).remove());
  return page.evaluate(async ({data, inked, targets, min}) => {
    const pixels = async (source: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), {width: image.naturalWidth, height: image.naturalHeight});
      const context = canvas.getContext('2d', {willReadFrequently: true})!;
      context.drawImage(image, 0, 0);
      return {canvas, context};
    };
    const {canvas, context} = await pixels(data), ink = (await pixels(inked)).context;
    const linear = (v: number) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    const luminance = (r: number, g: number, b: number) => .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
    const poor: {text: string; contrast: number}[] = [];
    for (const {text, color: [r, g, b, a], boxes} of targets) {
      const ratios: number[] = [];
      for (const box of boxes) {
        const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
        const w = Math.min(canvas.width - x, Math.ceil(box.w)), h = Math.min(canvas.height - y, Math.ceil(box.h));
        if (w < 1 || h < 1) continue;
        const px = context.getImageData(x, y, w, h).data, drawn = ink.getImageData(x, y, w, h).data;
        // Sample a grid of at most ~8,000 points per box, keeping those the text paints: what sits behind the glyphs,
        // not a highlight or a neighbour's art that only reaches into the line's box.
        const step = Math.max(1, Math.floor(Math.sqrt(w * h / 8000)));
        for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) {
          const k = (j * w + i) * 4, R = px[k], G = px[k + 1], B = px[k + 2];
          if (Math.abs(drawn[k] - R) + Math.abs(drawn[k + 1] - G) + Math.abs(drawn[k + 2] - B) < 24) continue;
          const back = luminance(R, G, B), fore = luminance(a * r + (1 - a) * R, a * g + (1 - a) * G, a * b + (1 - a) * B);
          ratios.push((Math.max(back, fore) + .05) / (Math.min(back, fore) + .05));
        }
      }
      if (!ratios.length) continue;
      ratios.sort((p, q) => p - q);
      const worst = ratios[Math.floor(ratios.length * .1)];
      if (worst < min) poor.push({text, contrast: Math.round(worst * 10) / 10});
    }
    return poor;
  }, {data: shot, inked, targets, min: MIN_CONTRAST});
}

/** Re-encode a PNG through a canvas, which always writes RGBA: stores want transparent-capable art as 32-bit PNG. */
async function rgba(page: Page, png: Buffer): Promise<Buffer> {
  return Buffer.from(await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), {width: image.naturalWidth, height: image.naturalHeight});
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, png.toString('base64')), 'base64');
}

/**
 * Renders cards `jobs` at a time, each browser one card at a time: a browser draws every page's WebGL in one GPU
 * process, so cards sharing a browser wait for each other. The first browser is the export's own; the others launch
 * when first needed. Tasks run in the order they were added, at most `jobs * 2` ahead of the last one taken. add()
 * returns a function that takes the task's result: the export takes them in order, so it writes, warns and logs in order.
 */
function renderQueue(jobs: number, browser: Browser) {
  const browsers: Promise<Browser>[] = [Promise.resolve(browser)];
  const idle = [...Array(jobs).keys()].reverse();
  const starts: ((slot: number) => void)[] = [];
  const running = new Set<Promise<void>>();
  let next = 0, taken = 0, stopped = false;
  const pump = () => {
    while (!stopped && idle.length && next < starts.length && next < taken + jobs * 2) starts[next++](idle.pop()!);
  };
  return {
    add<T>(task: (browser: Browser) => Promise<T>): () => Promise<T> {
      const index = starts.length;
      const result = new Promise<T>((resolve, reject) => starts.push(slot => {
        browsers[slot] ??= launchBrowser();
        const run = browsers[slot].then(task).then(resolve, reject).finally(() => { running.delete(run); idle.push(slot); pump(); });
        running.add(run);
      }));
      result.catch(() => {}); // A failure surfaces when its card is taken, not before.
      pump();
      return () => { taken = Math.max(taken, index); pump(); return result; };
    },
    /** Start nothing more, close the browsers (so cards still rendering stop too) and wait for them. */
    async close() {
      stopped = true;
      await Promise.allSettled(browsers.map(async b => (await b).close()));
      await Promise.allSettled(running);
    },
  };
}

type RenderQueue = ReturnType<typeof renderQueue>;

/** A gallery card to render. */
interface CardJob {
  locale: string;
  kind: string;
  index: number;
  slide: Card;
  file: string;
  label: string;
}

/** What a gallery card's page leaves behind: the image and what the export checks and writes with it. */
interface RenderedCard {
  report: CardReport;
  bytes: Buffer;
  /** The fastlane copy, as PNG. */
  fastlane: Buffer | null;
  edges: Edges | null;
}

interface GalleryPlan {
  kind: string;
  width: number;
  height: number;
  slides: Card[];
  cards: (CardJob & {rendered: () => Promise<RenderedCard>})[];
  /** Where fastlane wants these cards, if it does. */
  destination: {dir: string; prefix: string} | null;
}

interface StripPlan {
  strip: ReadmeStrip;
  /** Its cards' rendered PNGs, in order. */
  shots: (() => Promise<Buffer>)[];
}

interface LocalePlan {
  locale: string;
  dir: string;
  galleries: GalleryPlan[];
  strips: StripPlan[];
}

type Manifest = {galleries: Record<string, (ExportedCard & {slide: number; sources: string[]})[]>};

/** One export: the listing, the browser and the server, and what it has found and written so far. */
interface Run extends ListingFiles {
  /** The options, with the card resolved to its index. */
  options: Omit<ExportOptions, 'card'> & {card?: number};
  /** The export's own browser, which also draws the contact sheets and strips. */
  browser: Browser;
  /** The store-listing folder's address on the server. */
  base: string;
  queue: RenderQueue;
  gallery: typeof import('../core/gallery');
  cards: ExportedCard[];
  tallies: LocaleTally[];
  /** Fastlane screenshots, in temp folders until the export succeeds. */
  staged: {shots: string; destination: string; prefix: string}[];
  textFiles: {file: string; value: string}[];
  log: (line: string) => void;
  warn: (message: string) => void;
}

/** What a partial export rendered: these languages (all when unset), this gallery, this card. */
interface ExportScope { locales?: string[]; gallery?: string; card?: number }

/**
 * The report after a partial export: the new run's cards, warnings and language tallies, plus everything from the
 * previous report that the run didn't render again. Warnings are kept by the language and card they start with
 * ("de-DE/phone/phone-02-log.jpg: …", "de-DE/phone: …"); one that names neither is the new run's to give.
 */
export function mergeReport(previous: ExportResult, latest: ExportResult, scope: ExportScope): ExportResult {
  const language = (locale: string) => !scope.locales?.length || scope.locales.includes(locale);
  const covered = (locale: string, kind?: string, index?: number) => language(locale)
    && (!scope.gallery || kind === undefined || kind === scope.gallery)
    && (scope.card === undefined || index === undefined || index === scope.card);
  const cards = (previous.cards || []).filter(card => !covered(card.locale, card.kind, card.index));
  const byFile = new Map((previous.cards || []).map(card => [card.file, card]));
  const warnings = (previous.warnings || []).filter(warning => {
    const where = warning.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\/([^:\s]+)[:\s]/);
    if (!where) return false;
    const card = byFile.get(`${where[1]}/${where[2]}`);
    if (card) return !covered(card.locale, card.kind, card.index);
    const [kind, ...rest] = where[2].split('/');
    // listing.json is checked on every run of its language; stale images only on a run of the whole language;
    // a gallery's seams on any run of that gallery but a single card's.
    if (kind.includes('.')) return !language(where[1]);
    if (rest.length) return !(language(where[1]) && !scope.gallery && scope.card === undefined);
    return !covered(where[1], kind, scope.card === undefined ? undefined : -1);
  });
  // A language's tally counts all its cards: a run of one gallery or card keeps the previous count.
  const whole = !scope.gallery && scope.card === undefined;
  const fresh = new Map(latest.locales.map(tally => [tally.locale, tally]));
  const old = new Map((previous.locales || []).map(tally => [tally.locale, tally]));
  const locales = [...new Set([...old.keys(), ...fresh.keys()])].map(locale => (whole || !old.has(locale) ? fresh.get(locale) : old.get(locale)) || old.get(locale)!);
  return {...latest, cards: [...cards, ...latest.cards], warnings: [...warnings, ...latest.warnings], locales};
}

const defaultJobs = () => Math.min(4, os.availableParallelism());

/** Render, check and write a listing's cards. Never throws for a card problem: the result says what failed. */
export async function exportListing(options: ExportOptions = {}): Promise<ExportResult> {
  const log = options.log || ((line: string) => console.log(line));
  const listing = requireListing(options.listing);
  const files = loadListing(listing);
  const warnings: string[] = [];
  const cards: ExportedCard[] = [];
  const tallies: LocaleTally[] = [];
  const staged: Run['staged'] = [];
  const warn = (message: string) => { warnings.push(message); log(`warning: ${message}`); };
  /** The card asked for, as its index once resolved. */
  let card: number | undefined;
  // export-report.json: what the exports have found, for the editor's review queue. A partial export (some languages,
  // one gallery, one card) replaces only what it rendered, so the rest of the last full export stays in review.
  const finish = (result: ExportResult): ExportResult => {
    const ran = {locales: options.locales, gallery: options.gallery, card, strict: !!options.strict};
    const file = path.join(listing, 'export-report.json');
    let report: ExportResult & {options?: object; partial?: boolean} = result;
    if (!result.error && (options.locales?.length || options.gallery || card !== undefined)) {
      let previous: ExportResult | null = null;
      try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* No report yet. */ }
      if (previous && !previous.error) report = {...mergeReport(previous, result, {locales: options.locales, gallery: options.gallery, card}), partial: true};
    }
    try { fs.writeFileSync(file, JSON.stringify({...report, finishedAt: new Date().toISOString(), options: ran}, null, 2) + '\n'); } catch {}
    return result;
  };

  // A theme under its old name would render as CSS alone: stop and say what to rename.
  const renamed = oldNames(listing);
  if (renamed.length) return finish({ok: false, cards, warnings, locales: tallies, error: renamed.map(old => old.fix).join('\n')});

  // What no render shows but check knows: starter words still in place, more cards than the store takes.
  const checked = checkListing(listing).issues;
  const placeholders = checked.filter(issue => issue.code === 'placeholder');
  if (placeholders.length) warn(`${count(placeholders.length, 'field')} in ${[...new Set(placeholders.map(issue => issue.file))].join(', ')} still hold the starter placeholder; \`npx screenshot-studio check\` lists them`);
  for (const issue of checked.filter(issue => issue.code === 'store-limit')) warn(`${issue.file}: ${issue.message}`);

  const gallery = await import('../core/gallery');
  let server: Server | null = null, browser: Browser | null = null, queue: RenderQueue | null = null;
  try {
    if (options.gallery && options.gallery !== 'strips' && !files.galleries[options.gallery]) throw new Error(`Unknown gallery ${options.gallery}. Choose ${Object.keys(files.galleries).join(', ')}.`);
    if (options.card !== undefined) {
      const kinds = Object.keys(files.galleries).filter(kind => !options.gallery || kind === options.gallery);
      const asked = String(options.card).trim();
      if (/^\d+$/.test(asked)) {
        card = Number(asked);
        if (!kinds.some(kind => gallery.cardsFor(files.galleries, kind).length > card!)) throw new Error(`No card ${card} in ${options.gallery || 'any gallery'}: cards count from 0.`);
      } else {
        // A feature name: the card that has it, in the one gallery asked for.
        if (!options.gallery) throw new Error(`--card ${asked} names a card: say which gallery with --gallery (${kinds.join(', ')}).`);
        const features = gallery.cardsFor(files.galleries, options.gallery).map(c => c.feature);
        card = features.indexOf(asked);
        if (card < 0) throw new Error(`No card "${asked}" in ${options.gallery}. Its cards: ${features.join(', ')}.`);
      }
    }
    const problems = outputProblems({...files, locales: options.locales?.length ? options.locales : files.locales});
    if (problems.length) throw new Error(problems.map(p => `${p.file}: ${p.message}`).join('\n'));
    server = await serve(files.repo);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}/${path.relative(files.repo, listing).split(path.sep).join('/')}`;
    browser = await launchBrowser();
    queue = renderQueue(Math.max(1, Math.floor(options.jobs || defaultJobs())), browser);
    const run: Run = {...files, options: {...options, card}, browser, base, queue, gallery, cards, tallies, staged, textFiles: [], log, warn};
    const plans = plan(run);
    let failures = 0;
    for (const locale of plans) if (!await writeLocale(run, locale)) failures++;
    if (failures) throw new Error(`--strict: ${count(failures, 'language')} still borrow ${files.defaultLocale} words, captures or callout positions`);
    if (options.strict && warnings.length) throw new Error(`--strict: ${count(warnings.length, 'warning')}`);
    commitFastlane(staged);
    for (const {file, value} of run.textFiles) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, value); }
    return finish({ok: true, cards, warnings, locales: tallies});
  } catch (error) {
    return finish({ok: false, cards, warnings, locales: tallies, error: error instanceof Error ? error.message : String(error)});
  } finally {
    await (queue ? queue.close() : browser?.close());
    for (const {shots} of staged) fs.rmSync(shots, {recursive: true, force: true});
    server?.close();
  }
}

/** Every card the export will write, queued to render in the order the export reads them. */
function plan(run: Run): LocalePlan[] {
  const {config, profiles, galleries, defaultLocale, options, gallery: {cardsFor, outputFile}} = run;
  return (options.locales?.length ? options.locales : run.locales).map(locale => {
    const galleryPlans: GalleryPlan[] = [];
    for (const kind of Object.keys(galleries)) {
      if (options.gallery && options.gallery !== kind) continue;
      // README art (a hero, a before/after) is written once, in the default locale.
      if (profiles[kind].defaultLocaleOnly && locale !== defaultLocale) continue;
      const slides = cardsFor(galleries, kind);
      const {width, height} = profiles[kind];
      const destination = options.card === undefined ? laneShots(run, locale, kind) : null;
      const cards = [...slides.entries()].filter(([i]) => options.card === undefined || options.card === i).map(([index, slide]) => {
        const file = outputFile(kind, slide, index);
        const job: CardJob = {locale, kind, index, slide, file, label: `${locale}/${file}`};
        // A card that times out with nothing wrong (a 3D card on a busy machine) gets one more try on a fresh page.
        const render = (browser: Browser) => withCardPage(run, browser, locale, kind, page => renderCard(run, page, job, !!destination));
        return {...job, rendered: run.queue.add(browser => render(browser).catch((error: Error) => error.message.endsWith(NOT_READY) ? render(browser) : Promise.reject(error)))};
      });
      galleryPlans.push({kind, width, height, slides, cards, destination});
    }
    // README strips: a run of real store cards joined edge to edge, as the store carousel shows them.
    const strips: StripPlan[] = [];
    for (const strip of locale === defaultLocale && options.card === undefined ? config.readmeStrips || [] : []) {
      if (options.gallery && options.gallery !== strip.kind && options.gallery !== 'strips') continue;
      const shots = strip.cards.map((i, n) => {
        const position = strip.cards.length === 1 ? 'only' : n === 0 ? 'first' : n === strip.cards.length - 1 ? 'last' : 'middle';
        return run.queue.add(browser => withCardPage(run, browser, locale, strip.kind, page => renderStripCard(run, page, locale, strip.kind, i, position)));
      });
      strips.push({strip, shots});
    }
    return {locale, dir: path.join(run.listing, locale), galleries: galleryPlans, strips};
  });
}

// fastlane: Google Play defaults to fastlane/metadata/android/<locale>/images/phoneScreenshots; App Store defaults to
// fastlane/metadata/<locale>/ for text and fastlane/screenshots/<locale>/ for screenshots (prefixed by gallery).
function fastlaneConfig({config, profiles, defaultLocale}: Run) {
  const ios = storeFor(config, profiles) === 'App Store';
  const defaultScreenshots: Record<string, string> = ios
    ? Object.fromEntries(Object.keys(profiles).filter(k => profiles[k].platform === 'ios' && !profiles[k].defaultLocaleOnly).map(k => [k, '']))
    : {phone: 'images/phoneScreenshots'};
  return {ios, dir: ios ? 'fastlane/metadata' : 'fastlane/metadata/android', screenshots: defaultScreenshots,
    screenshotLocales: [defaultLocale] as string[] | 'all', locales: {} as Record<string, string>, ...config.fastlane};
}

const laneDir = (run: Run, locale: string) => { const {dir, locales} = fastlaneConfig(run); return path.join(run.repo, dir, locales[locale] || locale); };

function laneShots(run: Run, locale: string, kind: string): {dir: string; prefix: string} | null {
  const {ios, screenshots, screenshotLocales, locales} = fastlaneConfig(run);
  if (!run.options.fastlane || !(kind in screenshots) || !(screenshotLocales === 'all' || screenshotLocales.includes(locale))) return null;
  const target = screenshots[kind];
  if (ios && !target) return {dir: path.join(run.repo, 'fastlane/screenshots', locales[locale] || locale), prefix: `${kind}-`};
  return target ? {dir: path.join(laneDir(run, locale), target), prefix: ''} : null;
}

/** Use a fresh page, in a context of its own, sized for a card of `kind`; it closes even when the card fails. */
async function withCardPage<T>(run: Run, browser: Browser, locale: string, kind: string, use: (page: Page) => Promise<T>): Promise<T> {
  const {width, height} = run.profiles[kind];
  // studio.json "supersample": 2 renders at twice the resolution and downsamples, which keeps rotated and
  // scaled UI as crisp as the captures themselves.
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: run.config.supersample || 1, locale});
  try { return await use(page); }
  finally { await page.close().catch(() => {}); }
}

/** Render a gallery card on a fresh page and check it; throws what is wrong with it. */
async function renderCard(run: Run, page: Page, {locale, kind, index, slide, file, label}: CardJob, withFastlane: boolean): Promise<RenderedCard> {
  const {config, profiles} = run;
  const {width, height} = profiles[kind];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => { if (r.method() !== 'HEAD') errors.push(`Failed to load ${r.url()}`); });
  page.on('response', r => {
    // Optional files (locale copy, a locale's capture, layout sidecars) may be missing; everything else must load.
    // (A HEAD request is the renderer asking whether an optional file exists.)
    if (r.status() >= 400 && r.request().method() !== 'HEAD' && !/\/(copy|[^/]+\.nodes)\.json$|\/raw\//.test(new URL(r.url()).pathname)) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${run.base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${index}`);
  await page.locator('html[data-ready="true"]').waitFor({timeout: 30_000}).catch(() => { throw new Error(`${label}: ${errors.join('\n') || NOT_READY}`); });
  const report: CardReport = JSON.parse(await page.locator('html').getAttribute('data-report') || '{}');
  const fonts = await page.evaluate(() => [...document.fonts].map(f => f.status));
  if (fonts.includes('error') || (slide.title && !fonts.includes('loaded'))) throw new Error(`Fonts failed to load: ${label}`);
  if (!(report.fit > 0)) throw new Error(`Copy does not fit even at ${config.minFit || .72}× size; shorten it: ${label}`);
  const inside = (b: {x: number; y: number; width: number; height: number} | null) => !!b && b.x >= -.5 && b.y >= -.5 && b.x + b.width <= width + .5 && b.y + b.height <= height + .5;
  for (const el of await page.locator('[data-check-bounds]').all()) if (!inside(await el.boundingBox())) throw new Error(`Callout or label leaves the canvas: ${label}`);
  if (errors.length) throw new Error(errors.join('\n'));
  const png = file.endsWith('.png');
  // scale: 'css' downsamples a supersampled render to the canvas size, keeping opaque PNGs opaque.
  const shot = await page.screenshot({type: png ? 'png' : 'jpeg', scale: 'css', omitBackground: png && !!slide.transparent, ...(png ? {} : {quality: config.jpegQuality || 94})});
  const bytes = png && slide.transparent ? await rgba(page, shot) : shot;
  const fastlane = withFastlane ? await page.screenshot({type: 'png', scale: 'css'}) : null;
  // Before edgeColumns, which hides the foreground.
  if (!slide.transparent) report.hardToRead = await hardToRead(page);
  const edges = report.continuous && !profiles[kind].defaultLocaleOnly ? await edgeColumns(page, width, height) : null;
  return {report, bytes, fastlane, edges};
}

/** One card of a README strip, drawn for its place in the strip, as PNG. */
async function renderStripCard(run: Run, page: Page, locale: string, kind: string, index: number, position: string): Promise<Buffer> {
  await page.goto(`${run.base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${index}&strip=${position}`);
  await page.locator('html[data-ready="true"]').waitFor({timeout: 30_000});
  return page.screenshot({type: 'png', scale: 'css'});
}

/** Write one language: its cards, seams and contact sheets, strips, stale-file check, text and assets.json. False when --strict fails it. */
async function writeLocale(run: Run, plan: LocalePlan): Promise<boolean> {
  const {locale, dir} = plan;
  const {options, defaultLocale, config, profiles} = run;
  const manifest: Manifest = {galleries: {}};
  const written = new Set<string>();
  const tally: LocaleTally = {locale, cards: 0, untranslated: 0, borrowedCaptures: 0, movedCallouts: 0, fixedCallouts: 0, shrunk: 0};
  for (const gallery of plan.galleries) {
    manifest.galleries[gallery.kind] = [];
    const edges = await writeCards(run, plan, gallery, manifest, written, tally);
    checkSeams(run, locale, gallery.kind, edges);
    if (options.card !== undefined || gallery.slides.length < 2 || profiles[gallery.kind].defaultLocaleOnly || (config.contactSheets || {})[gallery.kind] === false) continue;
    await contactSheet(run, plan, gallery, manifest, written);
  }
  for (const strip of plan.strips) await writeStrip(run, plan, strip, written);
  if (!options.gallery && options.card === undefined) staleOutputs(run, plan, manifest, written);
  writeListingText(run, locale);
  if (config.writeAssets !== false && !options.gallery && options.card === undefined) fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');
  run.tallies.push(tally);
  return !(options.strict && locale !== defaultLocale && (tally.untranslated || tally.borrowedCaptures || tally.fixedCallouts));
}

/** Take a gallery's rendered cards in order: write each, note what it borrowed or shrank, and stage it for fastlane. Returns each card's edges. */
async function writeCards(run: Run, {locale, dir}: LocalePlan, gallery: GalleryPlan, manifest: Manifest, written: Set<string>, tally: LocaleTally): Promise<Edges[]> {
  const {defaultLocale, log, warn} = run;
  const {kind, width, height, destination} = gallery;
  const edges: Edges[] = [];
  const shots = destination ? fs.mkdtempSync(path.join(os.tmpdir(), 'studio-fastlane-')) : null;
  if (shots && destination) run.staged.push({shots, destination: destination.dir, prefix: destination.prefix});
  for (const {index: i, slide, file, label, rendered} of gallery.cards) {
    const {report, bytes, fastlane, edges: edge} = await rendered();
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), bytes);
    written.add(path.join(dir, file));
    if (shots && fastlane && destination) fs.writeFileSync(path.join(shots, `${destination.prefix}${i + 1}.png`), fastlane);
    if (edge) edges[i] = edge;

    const notes: string[] = [];
    if (locale !== defaultLocale) {
      tally.movedCallouts += report.movedCallouts.length;
      if (report.missingCopy.length) { tally.untranslated++; notes.push(`untranslated: ${report.missingCopy.join(', ')}`); }
      if (report.fallbackCaptures.length) { tally.borrowedCaptures++; notes.push(`${defaultLocale} capture: ${report.fallbackCaptures.join(', ')}`); }
      if (report.fixedCallouts.length) { tally.fixedCallouts++; notes.push('callout kept its default-locale position'); }
    }
    if (report.fit < 1) { tally.shrunk++; notes.push(`copy shrunk to ${Math.round(report.fit * 100)}%`); }
    for (const {text, contrast} of report.hardToRead || [])
      warn(`${label}: "${text}" is hard to read against what's behind it (contrast ${contrast.toFixed(1)}:1, needs at least ${MIN_CONTRAST}:1); change its color, or move or tone down the art behind it`);
    if (report.widows?.length) warn(`${label}: "${report.widows.join('", "')}" is left on a short last line; reword or shorten the copy`);
    tally.cards++;
    const card: ExportedCard = {locale, kind, index: i, feature: slide.feature, file: path.join(locale, file).split(path.sep).join('/'), width, height, bytes: bytes.length, notes};
    run.cards.push({...card, layout: report.layout});
    manifest.galleries[kind].push({...card, file, slide: i, sources: run.gallery.devicesFor(slide).map(d => `raw/${d.raw}`)});
    log(`${label}${notes.length ? `  (${notes.join('; ')})` : ''}`);
  }
  return edges;
}

/** Warn where a continuous background breaks between neighbouring cards. */
function checkSeams(run: Run, locale: string, kind: string, edges: Edges[]) {
  for (let i = 0; i + 1 < edges.length; i++) {
    const rows = edges[i] && edges[i + 1] ? seamBreak(edges[i][1], edges[i + 1][0]) : null;
    if (rows !== null) run.warn(`${locale}/${kind}: the background breaks at the seam between cards ${i + 1} and ${i + 2} (${rows}% of rows differ)`);
  }
}

// Wait until a sheet's images are decoded, as preview.html does for a card. While other cards render, a screenshot
// taken before then can fail ("Unable to capture screenshot").
const decoded = (sheet: Page) => sheet.evaluate(() => Promise.all([...document.images].map(image => image.decode())));

/** Contact sheet: the set edge to edge, so seams can be checked at a glance. */
async function contactSheet(run: Run, {locale, dir}: LocalePlan, {kind, width, height, slides}: GalleryPlan, manifest: Manifest, written: Set<string>) {
  const h = width > height ? 600 : 960, w = Math.round(h * width / height);
  const sheet = await run.browser.newPage({viewport: {width: w * slides.length, height: h}});
  await sheet.setContent(`<body style="margin:0;display:flex">${manifest.galleries[kind].map(m => `<img src="${run.base}/${locale}/${m.file}?t=${Date.now()}" style="height:${h}px;width:${w}px">`).join('')}</body>`);
  await sheet.waitForLoadState('networkidle');
  await decoded(sheet);
  const sheetName = (run.config.contactSheets || {})[kind] || `contact-${kind}.jpg`;
  written.add(path.join(dir, sheetName));
  fs.mkdirSync(path.dirname(path.join(dir, sheetName)), {recursive: true});
  await sheet.screenshot({path: path.join(dir, sheetName), type: 'jpeg', quality: 90});
  await sheet.close();
}

/** Join a strip's rendered cards into one image. */
async function writeStrip(run: Run, {locale, dir}: LocalePlan, {strip, shots: rendered}: StripPlan, written: Set<string>) {
  const {width, height} = run.profiles[strip.kind];
  const shots: string[] = [];
  for (const shot of rendered) shots.push((await shot()).toString('base64'));
  const h = strip.height || 1200, w = Math.round(h * width / height);
  const sheet = await run.browser.newPage({viewport: {width: w * shots.length, height: h}});
  await sheet.setContent(`<body style="margin:0;display:flex">${shots.map(s => `<img src="data:image/png;base64,${s}" style="height:${h}px;width:${w}px">`).join('')}</body>`);
  await sheet.waitForLoadState('load');
  await decoded(sheet);
  fs.mkdirSync(path.dirname(path.join(dir, strip.file)), {recursive: true});
  written.add(path.join(dir, strip.file));
  await sheet.screenshot({path: path.join(dir, strip.file), type: 'jpeg', quality: run.config.jpegQuality || 92});
  await sheet.close();
  run.log(`${locale}/${strip.file}  (strip of ${strip.kind} ${strip.cards.map(i => i + 1).join(', ')})`);
}

// Stale outputs: images in a folder of cards that no card, contact sheet or strip writes any more.
// Only a full export knows every file it writes; a partial one (--gallery, --card) can't tell stale from skipped.
function staleOutputs(run: Run, {dir}: LocalePlan, manifest: Manifest, written: Set<string>) {
  const files = Object.values(manifest.galleries).flat().map(m => path.join(dir, m.file));
  for (const folder of new Set(files.map(f => path.dirname(f)))) {
    for (const f of fs.readdirSync(folder)) {
      if (!IMAGES.test(f) || written.has(path.join(folder, f))) continue;
      const stale = path.relative(run.listing, path.join(folder, f));
      if (run.options.prune) { fs.rmSync(path.join(folder, f)); run.log(`deleted ${stale} (no card writes it any more)`); }
      else run.warn(`${stale} is no longer in the gallery; delete it, or export with --prune`);
    }
  }
}

/** Check <locale>/listing.json against the store's limits, and write it as fastlane text when asked. */
function writeListingText(run: Run, locale: string) {
  const store = storeFor(run.config, run.profiles);
  const json = readJson<Listing | null>(path.join(run.listing, locale, 'listing.json'), null);
  const words = json && {...json, title: json.title ?? json.appName};
  for (const problem of words ? listingProblems(words, store) : []) run.warn(`${locale}/listing.json ${problem.message}`);
  if (!run.options.fastlane || !words) return;
  const dir = laneDir(run, locale);
  type ListingField = 'title' | 'subtitle' | 'promotionalText' | 'keywords' | 'description' | 'whatsNew' | 'shortDescription' | 'fullDescription';
  const fields: readonly (readonly [ListingField, string])[] = store === 'App Store'
    ? [['title', 'name'], ['subtitle', 'subtitle'], ['promotionalText', 'promotional_text'], ['keywords', 'keywords'], ['description', 'description'], ['whatsNew', 'release_notes']]
    : [['title', 'title'], ['shortDescription', 'short_description'], ['fullDescription', 'full_description']];
  for (const [field, name] of fields) {
    const value = field === 'description' ? (words.description ?? words.fullDescription) : words[field];
    if (typeof value === 'string') run.textFiles.push({file: path.join(dir, `${name}.txt`), value: `${value.trimEnd()}\n`});
  }
}

/** Replace each fastlane screenshot folder's images with the staged ones; only a successful export gets here. */
function commitFastlane(staged: Run['staged']) {
  const cleared = new Set<string>();
  for (const {shots, destination, prefix} of staged) {
    fs.mkdirSync(destination, {recursive: true});
    const key = `${destination}\0${prefix}`;
    if (!cleared.has(key)) {
      cleared.add(key);
      for (const f of fs.readdirSync(destination)) if (IMAGES.test(f) && (!prefix || f.startsWith(prefix))) fs.rmSync(path.join(destination, f));
    }
    for (const f of fs.readdirSync(shots)) fs.copyFileSync(path.join(shots, f), path.join(destination, f));
  }
}

/** The summary table the command line prints. */
export function formatSummary(result: ExportResult): string {
  const lines = ['locale      cards  untranslated  borrowed captures  moved callouts  unresolved callouts  shrunk copy'];
  for (const t of result.locales) lines.push(`${t.locale.padEnd(10)}  ${String(t.cards).padStart(5)}  ${String(t.untranslated).padStart(12)}  ${String(t.borrowedCaptures).padStart(17)}  ${String(t.movedCallouts).padStart(14)}  ${String(t.fixedCallouts).padStart(19)}  ${String(t.shrunk).padStart(11)}`);
  if (result.warnings.length) lines.push('', `${count(result.warnings.length, 'warning')}:`, ...result.warnings.map(w => `  ${w}`));
  return lines.join('\n');
}

/** `export`: see its help in src/cli/commands.ts. */
export async function run(argv: string[]): Promise<number> {
  const {parseCli, parseIntOption} = await import('./cli-args');
  const {usage} = await import('../cli/commands');
  const {values} = parseCli(argv, {
    locale: {type: 'string'},
    gallery: {type: 'string'},
    card: {type: 'string'},
    strict: {type: 'boolean'},
    fastlane: {type: 'boolean'},
    prune: {type: 'boolean'},
    jobs: {type: 'string'},
    json: {type: 'boolean'},
  }, {usage: usage('export')});
  const json = !!values.json;
  const result = await exportListing({
    locales: values.locale ? [values.locale] : undefined, gallery: values.gallery, card: values.card,
    strict: !!values.strict, fastlane: !!values.fastlane, prune: !!values.prune,
    jobs: parseIntOption(values.jobs, '--jobs', {min: 1}), log: json ? () => {} : undefined,
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n${formatSummary(result)}`);
    if (result.error) console.error(`\n${result.error}`);
  }
  return result.ok ? 0 : 1;
}
