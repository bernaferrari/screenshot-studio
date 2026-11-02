/**
 * Set up Screenshot Studio in an app.
 *   npx screenshot-studio init [app-folder] [--name "My App"] [--package com.example.app] [--theme starter]
 *                              [--screenshots ./folder] [--locales en-US,de-DE] [--platform android|ios]
 * `init` creates store-listing/ (never overwriting a file) and installs the agent skill. With
 * --screenshots builds the galleries from images you already have, so the first cards render with no emulator: a folder
 * (number the files to set the order) or a comma-separated list of files in card order.
 * --platform ios makes App Store galleries (iPhone 6.9″ and 6.3″, iPad 13″) and an iOS simulator tour instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import {imageSize} from './check';
import {readJson, writeJson} from './project';
import {APP_STORE, defaultSimulators, iosGalleryFor} from './ios';
import type {Card, Copy, Galleries, Profile, Profiles, StudioConfig} from '../core/types';

/** The package this command runs from: its templates/, themes/ and skills/. */
const PACKAGE = path.resolve(__dirname, '..');
const TEMPLATES = path.join(PACKAGE, 'templates', 'starter');
/** iOS files over the starter's: App Store profiles and gallery, the simulator tour, positions for the theme. */
const IOS_TEMPLATES = path.join(PACKAGE, 'templates', 'ios');
const THEMES = path.join(PACKAGE, 'themes');

const requirePackage = () => {
  if (!fs.existsSync(TEMPLATES)) throw new Error('Run this from the Screenshot Studio package: `npx screenshot-studio init`.');
};

export interface InitOptions {
  /** The app's folder (default: the working directory). */
  app?: string;
  name?: string;
  /** The Android package or iOS bundle ID; with it, init also writes a capture tour. */
  package?: string;
  theme?: string;
  /** Existing screenshots to build the galleries from: a folder (sorted naturally) or a comma-separated list in card order. */
  screenshots?: string;
  locales?: string[];
  /** android (default): Play galleries and an emulator tour; ios: App Store galleries and a simulator tour. */
  platform?: 'android' | 'ios';
  log?: (line: string) => void;
}

export interface InitResult {listing: string; created: string[]; kept: string[]; cards: number; theme: string; locales: string[]}

/** Every theme the package ships, with its one-line description. */
export function themes(): {name: string; description: string}[] {
  if (!fs.existsSync(THEMES)) return [];
  return fs.readdirSync(THEMES).filter(name => fs.existsSync(path.join(THEMES, name, 'theme.css'))).sort().map(name => {
    const first = fs.readFileSync(path.join(THEMES, name, 'theme.css'), 'utf8').match(/\/\*\s*([^*]+?)\s*\*\//);
    return {name, description: first ? first[1].replace(/^\{\{name\}\}:\s*/, '').split('\n')[0] : ''};
  });
}

/** The feature graphic Google Play asks every listing for. */
const featureGraphic = {
  profiles: {feature: {width: 1024, height: 500, frame: 'phone', label: 'Feature graphic', defaultLocaleOnly: true}} as Profiles,
  gallery: (raw: string): Galleries => ({feature: [{feature: 'feature-graphic', layout: 'banner', identity: true, raw, file: 'graphics/feature-graphic.png'}]}),
  copy: {'feature-graphic': {title: '', tagline: 'One line about what *your app* does.'}} as Copy,
};

const isImage = (file: string) => /\.(png|jpe?g|webp)$/i.test(file);
const LOCALE_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const imagesIn = (folder: string) => fs.existsSync(folder) && fs.statSync(folder).isDirectory()
  ? fs.readdirSync(folder).filter(isImage).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).map(file => path.join(folder, file)) : [];

/** Screenshots per language, and the language the others follow (en-US when there is one). */
export interface ScreenshotSets {byLocale: Record<string, string[]>; reference: string; folder: string; title?: string}

function setsOf(byLocale: Record<string, string[]>, folder: string, title?: string): ScreenshotSets | null {
  const locales = Object.keys(byLocale).filter(locale => byLocale[locale].length).sort();
  if (!locales.length) return null;
  const reference = locales.includes('en-US') ? 'en-US' : locales[0];
  return {byLocale: Object.fromEntries(locales.map(locale => [locale, byLocale[locale]])), reference, folder, title};
}

/**
 * Screenshots the app already has, in every language, where store tools keep them: fastlane's (supply for Play,
 * snapshot/deliver for the App Store), then a screenshots/ folder. Also the app's name, when fastlane has it.
 */
export function existingScreenshots(app: string, ios = false): ScreenshotSets | null {
  const languages = (folder: string) => fs.existsSync(path.join(app, folder)) ? fs.readdirSync(path.join(app, folder)).filter(name => LOCALE_DIR.test(name)) : [];
  const byLocale: Record<string, string[]> = {};
  if (ios) {
    for (const locale of languages('fastlane/screenshots')) (byLocale[locale] ||= []).push(...imagesIn(path.join(app, 'fastlane/screenshots', locale)));
    for (const locale of languages('fastlane/metadata')) (byLocale[locale] ||= []).push(...imagesIn(path.join(app, 'fastlane/metadata', locale, 'screenshots')));
  } else {
    for (const locale of languages('fastlane/metadata/android'))
      for (const kind of ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'])
        (byLocale[locale] ||= []).push(...imagesIn(path.join(app, 'fastlane/metadata/android', locale, 'images', kind)));
  }
  const title = (locale: string) => {
    const file = path.join(app, ios ? `fastlane/metadata/${locale}/name.txt` : `fastlane/metadata/android/${locale}/title.txt`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n')[0] || undefined : undefined;
  };
  const fastlane = setsOf(byLocale, path.join(app, 'fastlane'));
  if (fastlane) return {...fastlane, title: title(fastlane.reference)};
  for (const folder of ['screenshots', 'docs/screenshots', 'store/screenshots']) {
    const found = screenshotSets(path.join(app, folder));
    if (found) return found;
  }
  return null;
}

/** A --screenshots folder: its own images (one language), or one subfolder per language (en-US/, de-DE/…). */
export function screenshotSets(folder: string): ScreenshotSets | null {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return null;
  const own = imagesIn(folder);
  if (own.length) return setsOf({'en-US': own}, folder);
  return setsOf(Object.fromEntries(fs.readdirSync(folder).filter(name => LOCALE_DIR.test(name)).map(locale => [locale, imagesIn(path.join(folder, locale))])), folder);
}

/** A card name from a file name: no extension, order prefix, timestamps or device suffixes ("Screenshot_20240101-101010"). */
const slug = (text: string) => text.toLowerCase().replace(/\.[a-z]+$/, '').replace(/_/g, ' ').replace(/^\d+[- ]*/, '')
  .replace(/\d{5,}/g, ' ').replace(/\b(screenshot|screen ?shot|img|image|copy)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/-\d{1,3}$/, '').replace(/^-+|-+$/g, '').replace(/^\d+$/, '') || 'screen';
const words = (text: string) => slug(text).replace(/-/g, ' ');

/** Which gallery an image belongs to, by its shape. */
function galleryFor(width: number, height: number): {kind: string; profile: Profile} | null {
  const ratio = height / width;
  if (ratio >= 1.75) return {kind: 'phone', profile: {width: 1080, height: 1920, frame: 'phone', label: 'Phone'}};
  if (ratio >= 1.15) return {kind: 'tablet7', profile: {width: 1200, height: 1920, frame: 'tablet', label: '7″ tablet'}};
  if (ratio <= 1 / 1.15) return {kind: 'tablet10', profile: {width: 1920, height: 1200, frame: 'tablet', label: '10″ tablet'}};
  return null;
}

/** Galleries, profiles and words from a folder of images, copied into <locale>/raw/<gallery>/. */
/**
 * The images to import, in card order: a folder's images sorted naturally (so 2-x comes before 10-x; number the files
 * to set the order), or a comma-separated list of files in the order given.
 */
function screenshotFiles(source: string): {folder: string; images: string[]} {
  if (source.includes(',')) {
    const files = source.split(',').map(file => path.resolve(file.trim()));
    for (const file of files) if (!fs.existsSync(file) || !isImage(file)) throw new Error(`${file} isn't a PNG, JPEG or WebP image`);
    return {folder: '', images: files};
  }
  const folder = path.resolve(source);
  const images = fs.readdirSync(folder).filter(isImage).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
  if (!images.length) throw new Error(`No PNG, JPEG or WebP images in ${folder}`);
  return {folder, images};
}

function importScreenshots(source: string, listing: string, locale: string, log: (line: string) => void, ios = false) {
  const {folder, images} = screenshotFiles(source);
  const profiles: Profiles = {}, galleries: Galleries = {}, copy: Copy = {};
  for (const image of images) {
    const source = path.join(folder, image), file = path.basename(image);
    const size = imageSize(source);
    const target = size && (ios ? iosGalleryFor : galleryFor)(size.width, size.height);
    if (!size || !target) { log(`skipped   ${file} (not a phone or tablet shape)`); continue; }
    const {kind, profile} = target;
    // A gallery's capture size is its first image's; later images must have the same shape.
    if (!profiles[kind]) profiles[kind] = {...profile, captureWidth: size.width, captureHeight: size.height};
    else if (Math.abs(size.width / size.height - profiles[kind].captureWidth! / profiles[kind].captureHeight!) > .001) {
      log(`skipped   ${file} (${size.width}×${size.height} differs from the other ${kind} images)`); continue;
    }
    const cards = (galleries[kind] ||= []) as Card[];
    const feature = cards.some(card => card.feature === slug(file)) ? `${slug(file)}-${cards.length + 1}` : slug(file);
    const raw = `${kind}/${String(cards.length + 1).padStart(2, '0')}-${feature}${path.extname(file).toLowerCase()}`;
    fs.mkdirSync(path.join(listing, locale, 'raw', kind), {recursive: true});
    fs.copyFileSync(source, path.join(listing, locale, 'raw', raw));
    cards.push({feature, raw, layout: 'big'});
    copy[feature] ||= {title: `Your headline\nabout *${words(file)}*`, body: 'One short line on why it matters.'};
    log(`imported  ${file} → ${locale}/raw/${raw}`);
  }
  if (!Object.keys(galleries).length) throw new Error(`None of the images in ${folder || 'the list'} has a phone or tablet shape`);
  // Google Play: the 1024 × 500 feature graphic every listing needs, from the app's name and first phone screen.
  if (!ios && galleries.phone) Object.assign(profiles, featureGraphic.profiles), Object.assign(galleries, featureGraphic.gallery((galleries.phone as Card[])[0].raw!)), Object.assign(copy, featureGraphic.copy);
  // App Store: the 6.3″ iPhone gallery (required) shows the same captures as 6.9″, at its own size.
  if (ios && galleries.iphone) {
    const after = <T>(map: Record<string, T>, value: T): Record<string, T> =>
      Object.fromEntries(Object.entries(map).flatMap(([key, v]) => key === 'iphone' ? [[key, v], ['iphone63', value]] : [[key, v]]));
    return {profiles: after<Profile>(profiles, {...APP_STORE.iphone63}),
      galleries: after<Galleries[string]>(galleries, {inherits: 'iphone', cards: (galleries.iphone as Card[]).map(() => ({}))}), copy};
  }
  return {profiles, galleries, copy};
}

/**
 * Another language's screenshots onto the reference language's cards: the nth image of each gallery's shape becomes
 * that gallery's nth capture, under the same name, so every card shows this language's own screen.
 */
function importLocale(images: string[], listing: string, locale: string, imported: {profiles: Profiles; galleries: Galleries}, log: (line: string) => void, ios = false): number {
  const used: Record<string, number> = {};
  let count = 0;
  for (const source of images) {
    const file = path.basename(source), size = imageSize(source);
    const kind = size && (ios ? iosGalleryFor : galleryFor)(size.width, size.height)?.kind;
    const cards = kind ? imported.galleries[kind] : undefined;
    if (!size || !kind || !Array.isArray(cards)) { log(`skipped   ${locale}/${file} (no ${kind || 'phone or tablet'} gallery to match)`); continue; }
    const profile = imported.profiles[kind];
    if (Math.abs(size.width / size.height - profile.captureWidth! / profile.captureHeight!) > .001) { log(`skipped   ${locale}/${file} (${size.width}×${size.height} isn't the ${kind} shape)`); continue; }
    const card = cards[used[kind] = (used[kind] ?? -1) + 1];
    if (!card?.raw) { log(`skipped   ${locale}/${file} (more ${kind} screenshots than the reference language has)`); continue; }
    fs.mkdirSync(path.dirname(path.join(listing, locale, 'raw', card.raw)), {recursive: true});
    fs.copyFileSync(source, path.join(listing, locale, 'raw', card.raw));
    count++;
  }
  log(`imported  ${count} screenshot(s) for ${locale}`);
  return count;
}

export function init(options: InitOptions = {}): InitResult {
  requirePackage();
  const log = options.log || ((line: string) => console.log(line));
  const app = path.resolve(options.app || '.');
  const listing = path.join(app, 'store-listing');
  const found = options.screenshots && !options.screenshots.includes(',') ? screenshotSets(path.resolve(options.screenshots))
    : !options.screenshots && !options.package ? existingScreenshots(app, options.platform === 'ios') : null;
  if (found) log(`found     screenshots in ${Object.entries(found.byLocale).map(([locale, images]) => `${locale} (${images.length})`).join(', ')} in ${path.relative(app, found.folder) || '.'}`);
  const name = options.name || found?.title || path.basename(app);
  const pkg = options.package || '';
  const theme = options.theme || 'starter';
  const ios = options.platform === 'ios';
  if (options.platform && !['android', 'ios'].includes(options.platform)) throw new Error(`Unknown platform "${options.platform}": use android or ios`);
  if (!fs.existsSync(path.join(THEMES, theme, 'theme.css'))) throw new Error(`No theme "${theme}". Available: ${themes().map(t => t.name).join(', ')}`);
  const reference = found?.reference || 'en-US';
  const locales = [...new Set([reference, ...Object.keys(found?.byLocale || {}), ...(options.locales || [])])];
  const result: InitResult = {listing, created: [], kept: [], cards: 0, theme, locales};
  const sims = ios ? defaultSimulators() : null;
  const fill = (text: string) => text.replaceAll('{{name}}', name).replaceAll('{{package}}', pkg || 'com.example.app')
    .replaceAll('{{scheme}}', name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'myapp')
    .replaceAll('{{iphoneSimulator}}', sims?.iphone || '').replaceAll('{{ipadSimulator}}', sims?.ipad || '');
  const write = (relative: string, content: string | object) => {
    const file = path.join(listing, relative);
    if (fs.existsSync(file)) { result.kept.push(relative); log(`kept      ${relative}`); return; }
    fs.mkdirSync(path.dirname(file), {recursive: true});
    if (typeof content === 'string') fs.writeFileSync(file, content); else writeJson(file, content);
    result.created.push(relative);
    log(`created   ${relative}`);
  };
  // iOS files replace the starter's where templates/ios has them.
  const source = (relative: string) => ios && fs.existsSync(path.join(IOS_TEMPLATES, relative)) ? path.join(IOS_TEMPLATES, relative) : path.join(TEMPLATES, relative);
  const template = (relative: string, target = relative) => write(target, fill(fs.readFileSync(source(relative), 'utf8')));

  fs.mkdirSync(listing, {recursive: true});
  const config: StudioConfig & {$schema: string} = {...readJson<StudioConfig & {$schema: string}>(path.join(TEMPLATES, 'studio.json')), app: name, locales, defaultLocale: reference};
  if (pkg) config.package = pkg; else delete config.package;
  const screenshots = found ? found.byLocale[reference].join(',') : options.screenshots;
  if (screenshots) {
    const imported = importScreenshots(screenshots, listing, reference, log, ios);
    // Captured galleries keep the simulator a recapture would use.
    if (sims) for (const [kind, profile] of Object.entries(imported.profiles)) if (profile.captureWidth) profile.simulator = kind === 'iphone' ? sims.iphone : sims.ipad;
    write('studio.json', config);
    write('profiles.json', {$schema: 'https://unpkg.com/screenshot-studio/studio/schemas/profiles.schema.json', ...imported.profiles});
    write('gallery.json', {$schema: 'https://unpkg.com/screenshot-studio/studio/schemas/gallery.schema.json', ...imported.galleries});
    write(`${reference}/copy.json`, {$schema: 'https://unpkg.com/screenshot-studio/studio/schemas/copy.schema.json', ...imported.copy});
    // Every other language: its own screenshots on the same cards, and the reference's words as empty fields to translate.
    const blank = Object.fromEntries(Object.entries(imported.copy).map(([key, entry]) => [key, Object.fromEntries(Object.keys(entry).map(field => [field, '']))]));
    for (const locale of locales.filter(locale => locale !== reference)) {
      if (found?.byLocale[locale]) importLocale(found.byLocale[locale], listing, locale, imported, log, ios);
      write(`${locale}/copy.json`, {$schema: 'https://unpkg.com/screenshot-studio/studio/schemas/copy.schema.json', ...blank});
    }
    result.cards = Object.values(imported.galleries).reduce((n, gallery) => n + (Array.isArray(gallery) ? gallery : gallery.cards).length, 0);
  } else {
    // An app to capture: the starter cards, a scene tour, and how to build and install the capture app.
    if (pkg && ios) config.capture = {
      platform: 'ios',
      // A Debug build for the simulator; its scheme reads -screenshotScene (docs/capture.md, iOS).
      build: `xcodebuild -scheme "${name}" -configuration Debug -sdk iphonesimulator -derivedDataPath build/capture -quiet build`,
      install: [{app: `build/capture/Build/Products/Debug-iphonesimulator/${name}.app`, package: pkg}],
      runs: [{locales: 'all'}],
    };
    else if (pkg) config.capture = {
      build: './gradlew :app:assembleStoreCapture -q',
      install: [{apk: 'app/build/outputs/apk/storeCapture/app-storeCapture.apk', package: `${pkg}.storecapture`}],
      runs: [{locales: 'default'}],
    };
    write('studio.json', config);
    template('profiles.json');
    template('gallery.json');
    template('en-US/copy.json');
    if (pkg && !ios) template('capture-emulator.py');
    result.cards = ios ? 5 : 4;
  }
  if (ios) template('capture-simulator.py');
  template('en-US/listing.json', `${reference}/listing.json`);
  template('gitignore', '.gitignore');
  template('README.md');
  installTheme(listing, theme, {fill, write, result, ios});
  // Agents working in the app find the playbook here.
  const skill = path.join(PACKAGE, 'skills', 'store-screenshots', 'SKILL.md');
  if (fs.existsSync(skill) && !fs.existsSync(path.join(app, '.claude', 'skills', 'store-screenshots', 'SKILL.md'))) {
    fs.mkdirSync(path.join(app, '.claude', 'skills', 'store-screenshots'), {recursive: true});
    fs.copyFileSync(skill, path.join(app, '.claude', 'skills', 'store-screenshots', 'SKILL.md'));
    log('created   .claude/skills/store-screenshots/SKILL.md');
  }
  return result;
}

/**
 * Copy a theme into a listing: theme.css and theme.js (with the app's name filled in; iOS galleries get their positions
 * after the theme's own look) and its assets byte for byte. `write` decides whether existing files are kept.
 */
export function installTheme(listing: string, theme: string, options: {fill: (text: string) => string; write: (relative: string, content: string) => void; result?: {created: string[]; kept: string[]}; ios?: boolean; overwrite?: boolean}) {
  if (!fs.existsSync(path.join(THEMES, theme, 'theme.css'))) throw new Error(`No theme "${theme}". Available: ${themes().map(t => t.name).join(', ')}`);
  for (const file of ['theme.css', 'theme.js']) {
    const from = path.join(THEMES, theme, file);
    const extra = options.ios && file === 'theme.css' ? fs.readFileSync(path.join(IOS_TEMPLATES, 'theme.css'), 'utf8') : '';
    if (fs.existsSync(from)) options.write(file, options.fill(fs.readFileSync(from, 'utf8') + extra));
    else if (options.overwrite) fs.rmSync(path.join(listing, file), {force: true});
  }
  for (const asset of fs.existsSync(path.join(THEMES, theme, 'assets')) ? fs.readdirSync(path.join(THEMES, theme, 'assets')) : []) {
    const target = path.join(listing, 'assets', asset);
    if (fs.existsSync(target) && !options.overwrite) { options.result?.kept.push(`assets/${asset}`); continue; }
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(THEMES, theme, 'assets', asset), target);
    options.result?.created.push(`assets/${asset}`);
  }
}

/** `init [app] [--name …] [--package …] [--theme …] [--screenshots folder] [--locales a,b]` */
export async function run(argv: string[]): Promise<number> {
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const values = new Set(['name', 'package', 'theme', 'screenshots', 'locales', 'platform'].map(option));
  const app = argv.find(word => !word.startsWith('--') && !values.has(word));
  try {
    const result = init({app, name: option('name'), package: option('package'), theme: option('theme'), screenshots: option('screenshots'),
      locales: option('locales')?.split(',').map(l => l.trim()).filter(Boolean), platform: option('platform') as InitOptions['platform']});
    const where = path.relative(process.cwd(), path.dirname(result.listing)) || '.';
    const cd = where === '.' ? '' : `cd ${where} && `;
    console.log(`\nReady: ${result.cards} card(s) with the ${result.theme} theme.\n`);
    const others = result.locales.slice(1);
    // Spelled out for whoever runs this next, often an agent: what to fill in, then how to check and render.
    console.log(option('screenshots') || result.cards
      ? `Next:\n  1. Write the headlines in store-listing/${result.locales[0]}/copy.json (one per card, *highlight* a key word)${others.length ? `\n  2. Translate them into the empty fields of ${others.map(l => `${l}/copy.json`).join(', ')}` : ''}\n  ${others.length ? 3 : 2}. ${cd}npx screenshot-studio check, then export (or studio --open for the editor)`
      : option('platform') === 'ios'
        ? `Next:\n  1. Make the app's Debug build open each screen from a launch argument (-screenshotScene) with sample data (docs/capture.md, iOS)\n  2. Write the tour in store-listing/capture-simulator.py; check capture.build in studio.json\n  3. ${cd}npx screenshot-studio recapture --boot`
        : `Next:\n  1. Add a capture build that fills the app with sample data (docs/playbook.md, section 1)\n  2. Write the tour in store-listing/capture-emulator.py\n  3. ${cd}npx screenshot-studio recapture --boot`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}
