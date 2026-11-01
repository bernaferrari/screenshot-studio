// Screenshot Studio renderer. One card per page: preview.html?locale=de-DE&kind=phone&slide=0[&fit]
// The app supplies ../studio.json, ../profiles.json, ../gallery.json (layout), ../theme.css,
// ../theme.js, and per locale ../<locale>/copy.json (words) and ../<locale>/raw/ (captures).
// Each step lives in its own module; the theme's hooks run between them: art and compose before captures load,
// layout once frames have their size, decorate once everything is placed, refit while copy shrinks.
import {plainHeadline} from '../core/layout';
import type {ThemeContext} from '../core/types';
import {drawCallouts} from './callouts';
import {captureLoader, checkBounds, createDevices, labelDevices, measure, settleDevices, sizeFrames} from './devices';
import {findWidows, fitCopy} from './fit';
import {identity} from './identity';
import {loadCard} from './load';
import {headline} from './text';

const q = new URLSearchParams(location.search);
const root = document.documentElement;
// A README strip renders a card as first, middle, last or only of a run, so themes can hide art that sits on the
// strip's outer seams (html[data-strip="last"] .seam-right, say).
if (q.get('strip')) root.dataset.strip = q.get('strip')!;

const {config, profiles, locale, defaultLocale, kind, profile, slides, index, slide, report, theme} = await loadCard(q);
const W = profile.width, H = profile.height;
// Layout words, the keys for per-layout settings: the card's gallery kind, its feature and its `layout` classes.
const layoutWords = [kind, slide.feature, ...(slide.layout || '').split(/\s+/).filter(Boolean)];

root.lang = locale;
root.dir = (config.rtl || []).includes(locale) ? 'rtl' : 'ltr';
root.classList.add(kind, `frame-${profile.frame || 'phone'}`, W > H ? 'landscape' : 'portrait');
root.style.setProperty('--canvas-width', `${W}px`);
root.style.setProperty('--canvas-height', `${H}px`);
for (const [name, value] of Object.entries(slide.vars || {})) root.style.setProperty(name, value);

// The card: background art, headline, devices, then a name banner in place of the headline.
const main = document.createElement('main');
main.className = `campaign ${slide.feature} ${slide.layout || ''}`.trim();
main.innerHTML = '<svg class="art" aria-hidden="true"></svg>';
document.body.append(main);
const title = slide.identity ? null : headline(slide);
if (title) main.append(title);
main.setAttribute('aria-label', slide.alt || `${slide.feature}: ${plainHeadline(slide.title || '')}`);
const load = captureLoader(locale, defaultLocale, report);
const devices = createDevices(main, slide, profile, load);
if (slide.identity) main.append(await identity(slide, config));

const art = main.querySelector<SVGSVGElement>('.art')!;
art.setAttribute('viewBox', `0 0 ${W} ${H}`);
const context: ThemeContext = {W, H, kind, locale, defaultLocale, index, slide, slides, profile, profiles, config, main, art, capture: devices[0]?.img};
if (theme.art) art.innerHTML = theme.art(context) || '';
if (theme.compose) await theme.compose(context);

const locales = await settleDevices(devices, profiles);
// Borrowed captures in device order, not in the order their requests happened to fail.
report.fallbackCaptures = devices.filter(d => report.fallbackCaptures.includes(d.spec.raw)).map(d => d.spec.raw);
sizeFrames(devices, config, layoutWords);
if (theme.layout) await theme.layout(context);
const measured = context.devices = measure(main, devices, locales);
labelDevices(main, measured);
context.device = measured[0]?.box;
context.screen = measured[0]?.screen;
await drawCallouts(slide.callouts || [], {main, measured, screen: context.screen, defaultLocale, load, report});
if (theme.decorate) await theme.decorate(context);
checkBounds(measured, slide, profile, config, layoutWords);

// A theme with a background that runs across card seams says so (`continuous: true`, or a list of gallery kinds);
// the exporter then checks that neighbouring cards' touching edges match.
report.continuous = Array.isArray(theme.continuous) ? theme.continuous.includes(kind) : !!theme.continuous;
// The header to fit is whichever the card ends with, the theme's own included.
const header = main.querySelector('header');
if (header) {
  await fitCopy(main, header, {W, H}, config.minFit || .72, report, theme.refit && (() => theme.refit!(context)));
  const widows = findWidows(header);
  if (widows.length) report.widows = widows;
}

// ?fit scales the card to the window, for the editor's previews.
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
