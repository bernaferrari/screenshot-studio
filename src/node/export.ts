/**
 * Render every card to a store-ready image and check the composition (with Playwright, found wherever it is installed).
 *   node store-listing/studio/export.cjs [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--json]
 * Without --locale every locale in studio.json is rendered. --strict fails when a non-default locale
 * still borrows default-locale words or captures, or a callout could not follow its UI element.
 * It also warns (and --strict fails) when a gallery folder holds images no card writes any more, when a
 * continuous background (theme `continuous`) breaks at a seam, and when <locale>/listing.json is over Play's
 * limits. --fastlane writes fastlane/metadata/android/<locale>/ text and screenshots (studio.json "fastlane").
 * --prune deletes images no card writes any more. --json prints the result as JSON (for agents and tools); exportListing() returns the same result.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {Server} from 'node:http';
import type {Browser, Page} from 'playwright';
import type {CardReport, Listing} from '../core/types';
import {loadListing, readJson} from './project';
import {serve} from './server';
import {loadPlaywright} from './playwright';

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

// Play's listing limits, in characters.
const LIMITS: [keyof Listing, number][] = [['title', 30], ['shortDescription', 80], ['fullDescription', 4000]];
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

/** Render, check and write a listing's cards. Never throws for a card problem: the result says what failed. */
export async function exportListing(options: ExportOptions = {}): Promise<ExportResult> {
  const log = options.log || ((line: string) => console.log(line));
  const listing = options.listing ? path.resolve(options.listing) : path.resolve(__dirname, '..');
  const repo = path.dirname(listing);
  const {config, profiles, galleries} = loadListing(listing);
  const defaultLocale = config.defaultLocale || 'en-US';
  const warnings: string[] = [];
  const cards: ExportedCard[] = [];
  const tallies: LocaleTally[] = [];
  const staged: {shots: string; destination: string}[] = [];
  const warn = (message: string) => { warnings.push(message); log(`warning: ${message}`); };
  // export-report.json: the last export's result, for the editor's review queue.
  const finish = (result: ExportResult): ExportResult => {
    const ran = {locales: options.locales, kind: options.kind, card: options.card, strict: !!options.strict};
    try { fs.writeFileSync(path.join(listing, 'export-report.json'), JSON.stringify({...result, finishedAt: new Date().toISOString(), options: ran}, null, 2) + '\n'); } catch {}
    return result;
  };

  // fastlane: "fastlane": {"dir": "fastlane/metadata/android", "screenshots": {"phone": "images/phoneScreenshots"},
  // "screenshotLocales": ["en-US"] (or "all"), "locales": {"ru-RU": "ru"}} (all optional; these are the defaults but
  // the locale map). Text comes from <locale>/listing.json, screenshots are the gallery's cards as 1.png, 2.png, ….
  const lane = {dir: 'fastlane/metadata/android', screenshots: {phone: 'images/phoneScreenshots'} as Record<string, string>,
    screenshotLocales: [defaultLocale] as string[] | 'all', locales: {} as Record<string, string>, ...config.fastlane};
  const laneDir = (locale: string) => path.join(repo, lane.dir, lane.locales[locale] || locale);
  const laneShots = (locale: string, kind: string) => options.fastlane && lane.screenshots[kind] && (lane.screenshotLocales === 'all' || lane.screenshotLocales.includes(locale))
    ? path.join(laneDir(locale), lane.screenshots[kind]) : null;
  const listingFor = (locale: string): Listing | null => {
    const json = readJson<Listing | null>(path.join(listing, locale, 'listing.json'), null);
    return json && {...json, title: json.title ?? json.appName};
  };

  const {cardsFor, devicesFor, outputFile} = await import('../core/gallery');
  const {chromium} = loadPlaywright();
  let server: Server | null = null, browser: Browser | null = null;
  let failures = 0;
  try {
    server = await serve(repo);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const base = `http://127.0.0.1:${port}/${path.relative(repo, listing).split(path.sep).join('/')}`;
    browser = await chromium.launch();
    for (const locale of options.locales?.length ? options.locales : config.locales || [defaultLocale]) {
      const dir = path.join(listing, locale);
      const manifest: {galleries: Record<string, (ExportedCard & {slide: number; sources: string[]})[]>} = {galleries: {}};
      const written = new Set<string>();
      const tally: LocaleTally = {locale, cards: 0, untranslated: 0, borrowedCaptures: 0, movedCallouts: 0, fixedCallouts: 0, shrunk: 0};
      for (const kind of Object.keys(galleries)) {
        if (options.kind && options.kind !== kind) continue;
        // README art (a hero, a before/after) is written once, in the default locale.
        if (profiles[kind].defaultLocaleOnly && locale !== defaultLocale) continue;
        const slides = cardsFor(galleries, kind);
        const {width, height} = profiles[kind];
        manifest.galleries[kind] = [];
        const edges: Edges[] = [];
        const destination = options.card === undefined ? laneShots(locale, kind) : null;
        const shots = destination ? fs.mkdtempSync(path.join(os.tmpdir(), 'studio-fastlane-')) : null;
        if (shots && destination) staged.push({shots, destination});
        for (const [i, slide] of slides.entries()) {
          if (options.card !== undefined && options.card !== i) continue;
          const file = outputFile(kind, slide, i);
          // studio.json "supersample": 2 renders at twice the resolution and downsamples, which keeps rotated and
          // scaled UI as crisp as the captures themselves.
          const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: config.supersample || 1, locale});
          const errors: string[] = [];
          page.on('pageerror', e => errors.push(e.message));
          page.on('requestfailed', r => errors.push(`Failed to load ${r.url()}`));
          page.on('response', r => {
            // Optional files (locale copy, a locale's capture, layout sidecars) may be missing; everything else must load.
            if (r.status() >= 400 && !/\/(copy|[^/]+\.nodes)\.json$|\/raw\//.test(new URL(r.url()).pathname)) errors.push(`${r.status()} ${r.url()}`);
          });
          const label = `${locale}/${file}`;
          await page.goto(`${base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${i}`);
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
          fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
          fs.writeFileSync(path.join(dir, file), bytes);
          written.add(path.join(dir, file));
          if (shots) fs.writeFileSync(path.join(shots, `${i + 1}.png`), await page.screenshot({type: 'png', scale: 'css'}));
          if (report.continuous && !profiles[kind].defaultLocaleOnly) edges[i] = await edgeColumns(page, width, height);
          await page.close();

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
          cards.push(card);
          manifest.galleries[kind].push({...card, file, slide: i, sources: devicesFor(slide).map(d => `raw/${d.raw}`)});
          log(`${label}${notes.length ? `  (${notes.join('; ')})` : ''}`);
        }
        for (let i = 0; i + 1 < edges.length; i++) {
          const rows = edges[i] && edges[i + 1] ? seamBreak(edges[i][1], edges[i + 1][0]) : null;
          if (rows !== null) warn(`${locale}/${kind}: the background breaks at the seam between cards ${i + 1} and ${i + 2} (${rows}% of rows differ)`);
        }
        // Contact sheet: the set edge to edge, so seams can be checked at a glance.
        if (options.card !== undefined || slides.length < 2 || profiles[kind].defaultLocaleOnly || (config.contactSheets || {})[kind] === false) continue;
        const h = width > height ? 600 : 960, w = Math.round(h * width / height);
        const sheet = await browser.newPage({viewport: {width: w * slides.length, height: h}});
        await sheet.setContent(`<body style="margin:0;display:flex">${manifest.galleries[kind].map(m => `<img src="${base}/${locale}/${m.file}?t=${Date.now()}" style="height:${h}px;width:${w}px">`).join('')}</body>`);
        await sheet.waitForLoadState('networkidle');
        const sheetName = (config.contactSheets || {})[kind] || `contact-${kind}.jpg`;
        written.add(path.join(dir, sheetName));
        fs.mkdirSync(path.dirname(path.join(dir, sheetName)), {recursive: true});
        await sheet.screenshot({path: path.join(dir, sheetName), type: 'jpeg', quality: 90});
        await sheet.close();
      }
      // README strips: a run of real store cards joined edge to edge, as the store carousel shows them.
      for (const strip of locale === defaultLocale && options.card === undefined ? config.readmeStrips || [] : []) {
        if (options.kind && options.kind !== strip.kind && options.kind !== 'strips') continue;
        const {width, height} = profiles[strip.kind];
        const shots: string[] = [];
        for (const [n, i] of strip.cards.entries()) {
          const position = strip.cards.length === 1 ? 'only' : n === 0 ? 'first' : n === strip.cards.length - 1 ? 'last' : 'middle';
          const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: config.supersample || 1, locale});
          await page.goto(`${base}/studio/preview.html?locale=${locale}&kind=${strip.kind}&slide=${i}&strip=${position}`);
          await page.locator('html[data-ready="true"]').waitFor({timeout: 30_000});
          shots.push((await page.screenshot({type: 'png', scale: 'css'})).toString('base64'));
          await page.close();
        }
        const h = strip.height || 1200, w = Math.round(h * width / height);
        const sheet = await browser.newPage({viewport: {width: w * shots.length, height: h}});
        await sheet.setContent(`<body style="margin:0;display:flex">${shots.map(s => `<img src="data:image/png;base64,${s}" style="height:${h}px;width:${w}px">`).join('')}</body>`);
        await sheet.waitForLoadState('load');
        fs.mkdirSync(path.dirname(path.join(dir, strip.file)), {recursive: true});
        written.add(path.join(dir, strip.file));
        await sheet.screenshot({path: path.join(dir, strip.file), type: 'jpeg', quality: config.jpegQuality || 92});
        await sheet.close();
        log(`${locale}/${strip.file}  (strip of ${strip.kind} ${strip.cards.map(i => i + 1).join(', ')})`);
      }
      // Stale outputs: images in a folder of cards that no card, contact sheet or strip writes any more.
      // Only a full export knows every file it writes; a partial one (--kind, --card) can't tell stale from skipped.
      if (!options.kind && options.card === undefined) {
        const files = Object.values(manifest.galleries).flat().map(m => path.join(dir, m.file));
        for (const folder of new Set(files.map(f => path.dirname(f)))) {
          for (const f of fs.readdirSync(folder)) {
            if (!IMAGES.test(f) || written.has(path.join(folder, f))) continue;
            const stale = path.relative(listing, path.join(folder, f));
            if (options.prune) { fs.rmSync(path.join(folder, f)); log(`deleted ${stale} (no card writes it any more)`); }
            else warn(`${stale} is no longer in the gallery; delete it, or export with --prune`);
          }
        }
      }
      const words = listingFor(locale);
      for (const [field, max] of words ? LIMITS : []) {
        const value = words![field];
        const length = typeof value === 'string' ? [...value].length : 0;
        if (length > max) warn(`${locale}/listing.json ${String(field)} has ${length} characters; Play allows ${max}`);
      }
      if (options.fastlane && words) {
        fs.mkdirSync(laneDir(locale), {recursive: true});
        for (const [field, name] of [['title', 'title'], ['shortDescription', 'short_description'], ['fullDescription', 'full_description']] as const) {
          const value = words[field];
          if (typeof value === 'string') fs.writeFileSync(path.join(laneDir(locale), `${name}.txt`), `${value.trimEnd()}\n`);
        }
      }
      if (config.writeAssets !== false && !options.kind) fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify(manifest, null, 2) + '\n');
      tallies.push(tally);
      if (options.strict && locale !== defaultLocale && (tally.untranslated || tally.borrowedCaptures || tally.fixedCallouts)) failures++;
    }
    if (failures) throw new Error(`--strict: ${failures} locale(s) still borrow ${defaultLocale} words, captures or callout positions`);
    if (options.strict && warnings.length) throw new Error(`--strict: ${warnings.length} warning(s)`);
    for (const {shots, destination} of staged) {
      fs.mkdirSync(destination, {recursive: true});
      for (const f of fs.readdirSync(destination)) if (IMAGES.test(f)) fs.rmSync(path.join(destination, f));
      for (const f of fs.readdirSync(shots)) fs.copyFileSync(path.join(shots, f), path.join(destination, f));
    }
    return finish({ok: true, cards, warnings, locales: tallies});
  } catch (error) {
    return finish({ok: false, cards, warnings, locales: tallies, error: error instanceof Error ? error.message : String(error)});
  } finally {
    for (const {shots} of staged) fs.rmSync(shots, {recursive: true, force: true});
    await browser?.close();
    server?.close();
  }
}

/** The summary table the command line prints. */
export function formatSummary(result: ExportResult): string {
  const lines = ['locale      cards  untranslated  borrowed captures  moved callouts  unresolved callouts  shrunk copy'];
  for (const t of result.locales) lines.push(`${t.locale.padEnd(10)}  ${String(t.cards).padStart(5)}  ${String(t.untranslated).padStart(12)}  ${String(t.borrowedCaptures).padStart(17)}  ${String(t.movedCallouts).padStart(14)}  ${String(t.fixedCallouts).padStart(19)}  ${String(t.shrunk).padStart(11)}`);
  if (result.warnings.length) lines.push('', `${result.warnings.length} warning(s):`, ...result.warnings.map(w => `  ${w}`));
  return lines.join('\n');
}

/** `export [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--prune] [--json]` */
export async function run(argv: string[]): Promise<number> {
  const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const json = argv.includes('--json');
  const card = arg('card');
  const result = await exportListing({
    locales: arg('locale') ? [arg('locale')!] : undefined, kind: arg('kind'), card: card === undefined ? undefined : Number(card),
    strict: argv.includes('--strict'), fastlane: argv.includes('--fastlane'), prune: argv.includes('--prune'), listing: arg('listing'),
    log: json ? () => {} : undefined,
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`\n${formatSummary(result)}`);
    if (result.error) console.error(`\n${result.error}`);
  }
  return result.ok ? 0 : 1;
}
