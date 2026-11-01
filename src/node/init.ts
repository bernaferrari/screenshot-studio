/**
 * Set up Screenshot Studio in an app, and keep its copy of the studio current.
 *   npx screenshot-studio init [app-folder] [--name "My App"] [--package com.example.app] [--theme starter]
 *                              [--screenshots ./folder] [--locales en-US,de-DE] [--platform android|ios]
 *   npx screenshot-studio sync [app-folder] [--check]
 * `init` creates store-listing/ (never overwriting a file), copies the studio into store-listing/studio/, and with
 * --screenshots builds the galleries from images you already have, so the first cards render with no emulator.
 * --platform ios makes App Store galleries (iPhone 6.9″ and 6.3″, iPad 13″) and an iOS simulator tour instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import {imageSize} from './check';
import {readJson, writeJson} from './project';
import {APP_STORE, defaultSimulators, iosGalleryFor} from './ios';
import type {Card, Copy, Galleries, Profile, Profiles, StudioConfig} from '../core/types';

/** The package this command runs from: its studio/, templates/ and themes/. */
const PACKAGE = path.resolve(__dirname, '..');
const STUDIO = path.join(PACKAGE, 'studio');
const TEMPLATES = path.join(PACKAGE, 'templates', 'starter');
/** iOS files over the starter's: App Store profiles and gallery, the simulator tour, positions for the theme. */
const IOS_TEMPLATES = path.join(PACKAGE, 'templates', 'ios');
const THEMES = path.join(PACKAGE, 'themes');

export const version = (): string => fs.readFileSync(path.join(STUDIO, 'VERSION'), 'utf8').trim();

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
  /** A folder of existing screenshots to build the galleries from. */
  screenshots?: string;
  locales?: string[];
  /** android (default): Play galleries and an emulator tour; ios: App Store galleries and a simulator tour. */
  platform?: 'android' | 'ios';
  log?: (line: string) => void;
}

export interface InitResult {listing: string; created: string[]; kept: string[]; cards: number; theme: string}

/** Every theme the package ships, with its one-line description. */
export function themes(): {name: string; description: string}[] {
  if (!fs.existsSync(THEMES)) return [];
  return fs.readdirSync(THEMES).filter(name => fs.existsSync(path.join(THEMES, name, 'theme.css'))).sort().map(name => {
    const first = fs.readFileSync(path.join(THEMES, name, 'theme.css'), 'utf8').match(/\/\*\s*([^*]+?)\s*\*\//);
    return {name, description: first ? first[1].replace(/^\{\{name\}\}:\s*/, '').split('\n')[0] : ''};
  });
}

/** Copy the package's studio into the app (store-listing/studio/), replacing the old copy. */
export function syncStudio(app: string): string {
  const target = path.join(path.resolve(app), 'store-listing', 'studio');
  fs.rmSync(target, {recursive: true, force: true});
  fs.cpSync(STUDIO, target, {recursive: true, filter: source => !/(__pycache__|\.pyc$|\.DS_Store$)/.test(source)});
  return target;
}

/** Files that differ between the package's studio and the app's copy. */
export function studioDrift(app: string): string[] {
  const target = path.join(path.resolve(app), 'store-listing', 'studio');
  const list = (root: string): string[] => fs.existsSync(root) ? fs.readdirSync(root, {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile() && !/(__pycache__|\.pyc$|\.DS_Store$)/.test(path.join(entry.parentPath, entry.name)))
    .map(entry => path.relative(root, path.join(entry.parentPath, entry.name))) : [];
  const ours = new Set(list(STUDIO)), theirs = new Set(list(target));
  return [...new Set([...ours, ...theirs])].filter(file => !ours.has(file) || !theirs.has(file) ||
    !fs.readFileSync(path.join(STUDIO, file)).equals(fs.readFileSync(path.join(target, file)))).sort();
}

const slug = (text: string) => text.toLowerCase().replace(/\.[a-z]+$/, '').replace(/^\d+[-_ ]*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';
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
function importScreenshots(folder: string, listing: string, locale: string, log: (line: string) => void, ios = false) {
  const images = fs.readdirSync(folder).filter(file => /\.(png|jpe?g|webp)$/i.test(file)).sort();
  if (!images.length) throw new Error(`No PNG, JPEG or WebP images in ${folder}`);
  const profiles: Profiles = {}, galleries: Galleries = {}, copy: Copy = {};
  for (const file of images) {
    const size = imageSize(path.join(folder, file));
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
    fs.copyFileSync(path.join(folder, file), path.join(listing, locale, 'raw', raw));
    cards.push({feature, raw, layout: 'big'});
    copy[feature] ||= {title: `Your headline\nabout *${words(file)}*`, body: 'One short line on why it matters.'};
    log(`imported  ${file} → ${locale}/raw/${raw}`);
  }
  if (!Object.keys(galleries).length) throw new Error(`None of the images in ${folder} has a phone or tablet shape`);
  // App Store: the 6.3″ iPhone gallery (required) shows the same captures as 6.9″, at its own size.
  if (ios && galleries.iphone) {
    const after = <T>(map: Record<string, T>, value: T): Record<string, T> =>
      Object.fromEntries(Object.entries(map).flatMap(([key, v]) => key === 'iphone' ? [[key, v], ['iphone63', value]] : [[key, v]]));
    return {profiles: after<Profile>(profiles, {...APP_STORE.iphone63}),
      galleries: after<Galleries[string]>(galleries, {inherits: 'iphone', cards: (galleries.iphone as Card[]).map(() => ({}))}), copy};
  }
  return {profiles, galleries, copy};
}

export function init(options: InitOptions = {}): InitResult {
  requirePackage();
  const log = options.log || ((line: string) => console.log(line));
  const app = path.resolve(options.app || '.');
  const listing = path.join(app, 'store-listing');
  const name = options.name || path.basename(app);
  const pkg = options.package || '';
  const theme = options.theme || 'starter';
  const ios = options.platform === 'ios';
  if (options.platform && !['android', 'ios'].includes(options.platform)) throw new Error(`Unknown platform "${options.platform}": use android or ios`);
  if (!fs.existsSync(path.join(THEMES, theme, 'theme.css'))) throw new Error(`No theme "${theme}". Available: ${themes().map(t => t.name).join(', ')}`);
  const locales = [...new Set(['en-US', ...(options.locales || [])])];
  const result: InitResult = {listing, created: [], kept: [], cards: 0, theme};
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
  const config: StudioConfig & {$schema: string; package?: string} = {...readJson<StudioConfig & {$schema: string}>(path.join(TEMPLATES, 'studio.json')), app: name, locales};
  if (pkg) config.package = pkg; else delete config.package;
  if (options.screenshots) {
    const imported = importScreenshots(path.resolve(options.screenshots), listing, 'en-US', log, ios);
    // Captured galleries keep the simulator a recapture would use.
    if (sims) for (const [kind, profile] of Object.entries(imported.profiles)) if (profile.captureWidth) profile.simulator = kind === 'iphone' ? sims.iphone : sims.ipad;
    write('studio.json', config);
    write('profiles.json', {$schema: './studio/schemas/profiles.schema.json', ...imported.profiles});
    write('gallery.json', {$schema: './studio/schemas/gallery.schema.json', ...imported.galleries});
    write('en-US/copy.json', {$schema: '../studio/schemas/copy.schema.json', ...imported.copy});
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
  template('en-US/listing.json');
  template('gitignore', '.gitignore');
  template('README.md');
  for (const file of ['theme.css', 'theme.js']) {
    const from = path.join(THEMES, theme, file);
    // iOS galleries get their positions after the theme's own look.
    const extra = ios && file === 'theme.css' ? fs.readFileSync(path.join(IOS_TEMPLATES, 'theme.css'), 'utf8') : '';
    if (fs.existsSync(from)) write(file, fill(fs.readFileSync(from, 'utf8') + extra));
  }
  // Theme assets (fonts, textures) are copied byte for byte.
  for (const asset of fs.existsSync(path.join(THEMES, theme, 'assets')) ? fs.readdirSync(path.join(THEMES, theme, 'assets')) : []) {
    const target = path.join(listing, 'assets', asset);
    if (fs.existsSync(target)) { result.kept.push(`assets/${asset}`); continue; }
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(THEMES, theme, 'assets', asset), target);
    result.created.push(`assets/${asset}`);
  }
  syncStudio(app);
  log(`synced    store-listing/studio (v${version()})`);
  // Agents working in the app find the playbook here.
  const skill = path.join(PACKAGE, 'skills', 'store-screenshots', 'SKILL.md');
  if (fs.existsSync(skill) && !fs.existsSync(path.join(app, '.claude', 'skills', 'store-screenshots', 'SKILL.md'))) {
    fs.mkdirSync(path.join(app, '.claude', 'skills', 'store-screenshots'), {recursive: true});
    fs.copyFileSync(skill, path.join(app, '.claude', 'skills', 'store-screenshots', 'SKILL.md'));
    log('created   .claude/skills/store-screenshots/SKILL.md');
  }
  return result;
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
    console.log(option('screenshots')
      ? `Next:\n  ${cd}npx screenshot-studio export        render the cards\n  npx screenshot-studio studio --open  edit words and look in the editor`
      : option('platform') === 'ios'
        ? `Next:\n  1. Make the app's Debug build open each screen from a launch argument (-screenshotScene) with sample data (docs/capture.md, iOS)\n  2. Write the tour in store-listing/capture-simulator.py; check capture.build in studio.json\n  3. ${cd}npx screenshot-studio recapture --boot`
        : `Next:\n  1. Add a capture build that fills the app with sample data (docs/playbook.md, section 1)\n  2. Write the tour in store-listing/capture-emulator.py\n  3. ${cd}npx screenshot-studio recapture --boot`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}

/** `sync [app] [--check]` */
export async function runSync(argv: string[]): Promise<number> {
  requirePackage();
  const app = path.resolve(argv.find(word => !word.startsWith('--')) || '.');
  if (!fs.existsSync(path.join(app, 'store-listing', 'studio.json'))) { console.error(`No store-listing/studio.json in ${app}`); return 1; }
  if (argv.includes('--check')) {
    const drift = studioDrift(app);
    console.log(drift.length ? `${drift.length} file(s) differ from v${version()}:\n${drift.map(f => `  ${f}`).join('\n')}` : `store-listing/studio is current (v${version()}).`);
    return drift.length ? 1 : 0;
  }
  syncStudio(app);
  console.log(`Synced studio v${version()} into ${path.join(app, 'store-listing', 'studio')}`);
  return 0;
}
