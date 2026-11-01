/**
 * Render every card to a store-ready image and check the composition (with Playwright, found wherever it is installed).
 *   node store-listing/studio/export.cjs [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--jobs 4] [--json]
 * Without --locale every locale in studio.json is rendered. --strict fails when a non-default locale
 * still borrows default-locale words or captures, or a callout could not follow its UI element.
 * It also warns (and --strict fails) when a gallery folder holds images no card writes any more, when a
 * continuous background (theme `continuous`) breaks at a seam, and when <locale>/listing.json is over Play's
 * limits. --fastlane writes fastlane/metadata/android/<locale>/ text and screenshots (studio.json "fastlane").
 * --prune deletes images no card writes any more. --jobs sets how many cards render at once.
 * --json prints the result as JSON (for agents and tools); exportListing() returns the same result.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Server} from 'node:http';
import type {Browser, Page} from 'playwright';
import type {Card, CardReport, Listing, ReadmeStrip} from '../core/types';
import {loadListing, readJson, requireListing, type ListingFiles} from './project';
import {serve} from './server';
import {launchBrowser} from './playwright';
import {listingProblems, storeFor} from '../core/stores';

export interface ExportOptions {
  /** The store-listing folder (default: the one this studio copy lives in). */
  listing?: string;
  /** Only these languages (default: every language in studio.json). */
  locales?: string[];
  /** Only this gallery (or `strips` for README strips). */
  kind?: string;
  /** Only this card (0-based) of `kind`. */
  card?: number;
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
  await page.evaluate(() => { for (const el of document.querySelectorAll<HTMLElement>('.device, header, .callout, .device-label, .identity')) el.style.visibility = 'hidden'; });
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
  destination: string | null;
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
  options: ExportOptions;
  /** The export's own browser, which also draws the contact sheets and strips. */
  browser: Browser;
  /** The store-listing folder's address on the server. */
  base: string;
  queue: RenderQueue;
  gallery: typeof import('../core/gallery');
  cards: ExportedCard[];
  tallies: LocaleTally[];
  /** Fastlane screenshots, in temp folders until the export succeeds. */
  staged: {shots: string; destination: string}[];
  log: (line: string) => void;
  warn: (message: string) => void;
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
  // export-report.json: the last export's result, for the editor's review queue.
  const finish = (result: ExportResult): ExportResult => {
    const ran = {locales: options.locales, kind: options.kind, card: options.card, strict: !!options.strict};
    try { fs.writeFileSync(path.join(listing, 'export-report.json'), JSON.stringify({...result, finishedAt: new Date().toISOString(), options: ran}, null, 2) + '\n'); } catch {}
    return result;
  };

  const gallery = await import('../core/gallery');
  let server: Server | null = null, browser: Browser | null = null, queue: RenderQueue | null = null;
  try {
    server = await serve(files.repo);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}/${path.relative(files.repo, listing).split(path.sep).join('/')}`;
    browser = await launchBrowser();
    queue = renderQueue(Math.max(1, Math.floor(options.jobs || defaultJobs())), browser);
    const run: Run = {...files, options, browser, base, queue, gallery, cards, tallies, staged, log, warn};
    const plans = plan(run);
    let failures = 0;
    for (const locale of plans) if (!await writeLocale(run, locale)) failures++;
    if (failures) throw new Error(`--strict: ${failures} locale(s) still borrow ${files.defaultLocale} words, captures or callout positions`);
    if (options.strict && warnings.length) throw new Error(`--strict: ${warnings.length} warning(s)`);
    commitFastlane(staged);
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
      if (options.kind && options.kind !== kind) continue;
      // README art (a hero, a before/after) is written once, in the default locale.
      if (profiles[kind].defaultLocaleOnly && locale !== defaultLocale) continue;
      const slides = cardsFor(galleries, kind);
      const {width, height} = profiles[kind];
      const destination = options.card === undefined ? laneShots(run, locale, kind) : null;
      const cards = [...slides.entries()].filter(([i]) => options.card === undefined || options.card === i).map(([index, slide]) => {
        const file = outputFile(kind, slide, index);
        const job: CardJob = {locale, kind, index, slide, file, label: `${locale}/${file}`};
        return {...job, rendered: run.queue.add(browser => withCardPage(run, browser, locale, kind, page => renderCard(run, page, job, !!destination)))};
      });
      galleryPlans.push({kind, width, height, slides, cards, destination});
    }
    // README strips: a run of real store cards joined edge to edge, as the store carousel shows them.
    const strips: StripPlan[] = [];
    for (const strip of locale === defaultLocale && options.card === undefined ? config.readmeStrips || [] : []) {
      if (options.kind && options.kind !== strip.kind && options.kind !== 'strips') continue;
      const shots = strip.cards.map((i, n) => {
        const position = strip.cards.length === 1 ? 'only' : n === 0 ? 'first' : n === strip.cards.length - 1 ? 'last' : 'middle';
        return run.queue.add(browser => withCardPage(run, browser, locale, strip.kind, page => renderStripCard(run, page, locale, strip.kind, i, position)));
      });
      strips.push({strip, shots});
    }
    return {locale, dir: path.join(run.listing, locale), galleries: galleryPlans, strips};
  });
}

// fastlane: "fastlane": {"dir": "fastlane/metadata/android", "screenshots": {"phone": "images/phoneScreenshots"},
// "screenshotLocales": ["en-US"] (or "all"), "locales": {"ru-RU": "ru"}} (all optional; these are the defaults but
// the locale map). Text comes from <locale>/listing.json, screenshots are the gallery's cards as 1.png, 2.png, ….
function fastlaneConfig({config, defaultLocale}: Run) {
  return {dir: 'fastlane/metadata/android', screenshots: {phone: 'images/phoneScreenshots'} as Record<string, string>,
    screenshotLocales: [defaultLocale] as string[] | 'all', locales: {} as Record<string, string>, ...config.fastlane};
}

const laneDir = (run: Run, locale: string) => { const {dir, locales} = fastlaneConfig(run); return path.join(run.repo, dir, locales[locale] || locale); };

function laneShots(run: Run, locale: string, kind: string): string | null {
  const {screenshots, screenshotLocales} = fastlaneConfig(run);
  return run.options.fastlane && screenshots[kind] && (screenshotLocales === 'all' || screenshotLocales.includes(locale))
    ? path.join(laneDir(run, locale), screenshots[kind]) : null;
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
  await page.locator('html[data-ready="true"]').waitFor({timeout: 30_000}).catch(() => { throw new Error(`${label}: ${errors.join('\n') || 'never became ready'}`); });
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
  if (!options.kind && options.card === undefined) staleOutputs(run, plan, manifest, written);
  writeListingText(run, locale);
  if (config.writeAssets !== false && !options.kind) fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');
  run.tallies.push(tally);
  return !(options.strict && locale !== defaultLocale && (tally.untranslated || tally.borrowedCaptures || tally.fixedCallouts));
}

/** Take a gallery's rendered cards in order: write each, note what it borrowed or shrank, and stage it for fastlane. Returns each card's edges. */
async function writeCards(run: Run, {locale, dir}: LocalePlan, gallery: GalleryPlan, manifest: Manifest, written: Set<string>, tally: LocaleTally): Promise<Edges[]> {
  const {defaultLocale, log, warn} = run;
  const {kind, width, height, destination} = gallery;
  const edges: Edges[] = [];
  const shots = destination ? fs.mkdtempSync(path.join(os.tmpdir(), 'studio-fastlane-')) : null;
  if (shots && destination) run.staged.push({shots, destination});
  for (const {index: i, slide, file, label, rendered} of gallery.cards) {
    const {report, bytes, fastlane, edges: edge} = await rendered();
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), bytes);
    written.add(path.join(dir, file));
    if (shots && fastlane) fs.writeFileSync(path.join(shots, `${i + 1}.png`), fastlane);
    if (edge) edges[i] = edge;

    const notes: string[] = [];
    if (locale !== defaultLocale) {
      tally.movedCallouts += report.movedCallouts.length;
      if (report.missingCopy.length) { tally.untranslated++; notes.push(`untranslated: ${report.missingCopy.join(', ')}`); }
      if (report.fallbackCaptures.length) { tally.borrowedCaptures++; notes.push(`${defaultLocale} capture: ${report.fallbackCaptures.join(', ')}`); }
      if (report.fixedCallouts.length) { tally.fixedCallouts++; notes.push('callout kept its default-locale position'); }
    }
    if (report.fit < 1) { tally.shrunk++; notes.push(`copy shrunk to ${Math.round(report.fit * 100)}%`); }
    if (report.widows?.length) warn(`${label}: "${report.widows.join('", "')}" is left on a short last line; reword or shorten the copy`);
    tally.cards++;
    const card: ExportedCard = {locale, kind, index: i, feature: slide.feature, file: path.join(locale, file).split(path.sep).join('/'), width, height, bytes: bytes.length, notes};
    run.cards.push(card);
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
// Only a full export knows every file it writes; a partial one (--kind, --card) can't tell stale from skipped.
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
  const json = readJson<Listing | null>(path.join(run.listing, locale, 'listing.json'), null);
  const words = json && {...json, title: json.title ?? json.appName};
  for (const problem of words ? listingProblems(words, storeFor(run.config, run.profiles)) : []) run.warn(`${locale}/listing.json ${problem.message}`);
  if (!run.options.fastlane || !words) return;
  const dir = laneDir(run, locale);
  fs.mkdirSync(dir, {recursive: true});
  for (const [field, name] of [['title', 'title'], ['shortDescription', 'short_description'], ['fullDescription', 'full_description']] as const) {
    const value = words[field];
    if (typeof value === 'string') fs.writeFileSync(path.join(dir, `${name}.txt`), `${value.trimEnd()}\n`);
  }
}

/** Replace each fastlane screenshot folder's images with the staged ones; only a successful export gets here. */
function commitFastlane(staged: Run['staged']) {
  for (const {shots, destination} of staged) {
    fs.mkdirSync(destination, {recursive: true});
    for (const f of fs.readdirSync(destination)) if (IMAGES.test(f)) fs.rmSync(path.join(destination, f));
    for (const f of fs.readdirSync(shots)) fs.copyFileSync(path.join(shots, f), path.join(destination, f));
  }
}

/** The summary table the command line prints. */
export function formatSummary(result: ExportResult): string {
  const lines = ['locale      cards  untranslated  borrowed captures  moved callouts  unresolved callouts  shrunk copy'];
  for (const t of result.locales) lines.push(`${t.locale.padEnd(10)}  ${String(t.cards).padStart(5)}  ${String(t.untranslated).padStart(12)}  ${String(t.borrowedCaptures).padStart(17)}  ${String(t.movedCallouts).padStart(14)}  ${String(t.fixedCallouts).padStart(19)}  ${String(t.shrunk).padStart(11)}`);
  if (result.warnings.length) lines.push('', `${result.warnings.length} warning(s):`, ...result.warnings.map(w => `  ${w}`));
  return lines.join('\n');
}

/** `export [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--prune] [--jobs 4] [--json]` */
export async function run(argv: string[]): Promise<number> {
  const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const json = argv.includes('--json');
  const card = arg('card'), jobs = arg('jobs');
  const result = await exportListing({
    locales: arg('locale') ? [arg('locale')!] : undefined, kind: arg('kind'), card: card === undefined ? undefined : Number(card),
    strict: argv.includes('--strict'), fastlane: argv.includes('--fastlane'), prune: argv.includes('--prune'), listing: arg('listing'),
    jobs: jobs === undefined ? undefined : Number(jobs), log: json ? () => {} : undefined,
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n${formatSummary(result)}`);
    if (result.error) console.error(`\n${result.error}`);
  }
  return result.ok ? 0 : 1;
}
