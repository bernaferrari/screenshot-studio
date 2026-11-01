/**
 * Check an app's listing without rendering anything: every file against its schema, then what schemas can't see
 * (captures that are missing or have the wrong shape, cards without words, words no card uses, store text over
 * Play's limits). Fast enough to run after every edit; `export` then checks the rendered result.
 *   npx screenshot-studio check [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import {validate, type Schema} from '../core/validate';
import {cardsFor, devicesFor} from '../core/gallery';
import {readJson} from './project';
import type {Copy, Galleries, Listing, Profiles, StudioConfig} from '../core/types';

export interface Issue {
  level: 'error' | 'warning';
  /** Relative to the store-listing folder. */
  file: string;
  /** Where in the file, as a JSON path. */
  path?: string;
  message: string;
  /** What to do about it. */
  fix?: string;
}

export interface CheckResult {
  ok: boolean;
  issues: Issue[];
  /** What was checked, for a one-line summary. */
  counted: {galleries: number; cards: number; captures: number; locales: number};
}

const LIMITS: [keyof Listing, number][] = [['title', 30], ['shortDescription', 80], ['fullDescription', 4000]];

/** Width and height of a PNG or JPEG, read from its header. */
export function imageSize(file: string): {width: number; height: number} | null {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(64 * 1024);
    const length = fs.readSync(fd, head, 0, head.length, 0);
    if (head.readUInt32BE(0) === 0x89504e47) return {width: head.readUInt32BE(16), height: head.readUInt32BE(20)};
    if (head[0] === 0xff && head[1] === 0xd8) {
      for (let i = 2; i + 9 < length;) {
        if (head[i] !== 0xff) { i++; continue; }
        const marker = head[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {height: head.readUInt16BE(i + 5), width: head.readUInt16BE(i + 7)};
        i += 2 + head.readUInt16BE(i + 2);
      }
    }
    return null;
  } finally { fs.closeSync(fd); }
}

export function checkListing(listingDir?: string): CheckResult {
  const listing = listingDir ? path.resolve(listingDir) : path.resolve(__dirname, '..');
  const schemas = path.join(__dirname, 'schemas');
  const issues: Issue[] = [];
  const error = (file: string, message: string, extra: Partial<Issue> = {}) => issues.push({level: 'error', file, message, ...extra});
  const warn = (file: string, message: string, extra: Partial<Issue> = {}) => issues.push({level: 'warning', file, message, ...extra});
  const counted = {galleries: 0, cards: 0, captures: 0, locales: 0};

  const load = <T>(file: string, schema: string, fallback?: T): T | null => {
    const full = path.join(listing, file);
    if (!fs.existsSync(full)) {
      if (fallback !== undefined) return fallback;
      error(file, 'is missing', {fix: 'Run `npx screenshot-studio init` to create a starter listing.'});
      return null;
    }
    let value: T;
    try { value = readJson<T>(full); } catch (e) { error(file, (e as Error).message); return null; }
    const definition = readJson<Schema | null>(path.join(schemas, `${schema}.schema.json`), null);
    if (definition) for (const problem of validate(value, definition)) error(file, problem.message, {path: problem.path});
    return value;
  };

  const config = load<StudioConfig>('studio.json', 'studio');
  const profiles = load<Profiles>('profiles.json', 'profiles');
  const galleries = load<Galleries>('gallery.json', 'gallery');
  if (!config || !profiles || !galleries) return {ok: false, issues, counted};

  const defaultLocale = config.defaultLocale || 'en-US';
  const locales = config.locales || [defaultLocale];
  counted.locales = locales.length;
  if (!locales.includes(defaultLocale)) error('studio.json', `defaultLocale ${defaultLocale} isn't in locales`, {path: 'locales', fix: `Add "${defaultLocale}" to locales.`});
  for (const file of ['theme.css']) if (!fs.existsSync(path.join(listing, file))) warn(file, 'is missing; cards render unstyled');

  // Real device ratios: every capture must match one of the configured capture sizes, in either orientation.
  const ratios = Object.values(profiles).filter(p => p.captureWidth && p.captureHeight).flatMap(p => [p.captureWidth! / p.captureHeight!, p.captureHeight! / p.captureWidth!]);
  const defaultCopy = load<Copy>(`${defaultLocale}/copy.json`, 'copy', {}) || {};
  const used = new Set<string>();
  const checkedRaws = new Set<string>();

  for (const kind of Object.keys(galleries)) {
    if (!profiles[kind]) { error('gallery.json', `gallery "${kind}" has no profile`, {path: kind, fix: `Add "${kind}" to profiles.json with its width and height.`}); continue; }
    let cards;
    try { cards = cardsFor(galleries, kind); } catch (e) { error('gallery.json', (e as Error).message, {path: kind}); continue; }
    counted.galleries++;
    cards.forEach((card, i) => {
      counted.cards++;
      const at = `${kind}[${i}]`;
      used.add(card.feature).add(`${kind}/${card.feature}`);
      const devices = devicesFor(card);
      for (const [d, device] of devices.entries()) {
        const raw = path.join(listing, defaultLocale, 'raw', device.raw);
        if (checkedRaws.has(raw)) continue;
        checkedRaws.add(raw);
        counted.captures++;
        if (!fs.existsSync(raw)) {
          error('gallery.json', `capture ${defaultLocale}/raw/${device.raw} doesn't exist`, {path: devices.length > 1 ? `${at}.devices[${d}].raw` : `${at}.raw`,
            fix: 'Capture it (`npx screenshot-studio recapture`), add the file, or fix the path.'});
          continue;
        }
        const size = imageSize(raw);
        if (size && ratios.length && !ratios.some(r => Math.abs(size.width / size.height - r) < .001))
          error('gallery.json', `${device.raw} is ${size.width}×${size.height}, which isn't the shape of any capture size in profiles.json`, {path: `${at}.raw`,
            fix: 'Recapture it at a configured size, or add a profile whose captureWidth × captureHeight has this shape.'});
      }
      for (const [c, callout] of (card.callouts || []).entries()) {
        if (!callout.raw && (callout.device || 0) >= devices.length) error('gallery.json', `callout ${c} points at device ${callout.device || 0}, but the card has ${devices.length}`, {path: `${at}.callouts[${c}]`});
        if (callout.raw && !fs.existsSync(path.join(listing, defaultLocale, 'raw', callout.raw))) error('gallery.json', `callout capture ${callout.raw} doesn't exist`, {path: `${at}.callouts[${c}].raw`});
      }
      const words = card.sharedCopy === false ? defaultCopy[`${kind}/${card.feature}`] : {...defaultCopy[card.feature], ...defaultCopy[`${kind}/${card.feature}`]};
      // A card meant to have no headline says so with "title": "" (README art under its own section heading, say).
      if (devices.length && !card.identity && !(words && 'title' in words) && profiles[kind].frame !== 'none')
        warn(`${defaultLocale}/copy.json`, `card "${card.feature}" (${kind}) has no headline`, {fix: `Add {"${card.feature}": {"title": "…", "body": "…"}}.`});
    });
  }
  for (const key of Object.keys(defaultCopy)) if (!used.has(key)) warn(`${defaultLocale}/copy.json`, `"${key}" isn't used by any card`, {path: key, fix: 'Remove it, or fix the card\'s feature name.'});

  for (const locale of locales) {
    if (locale !== defaultLocale) {
      const file = `${locale}/copy.json`;
      if (!fs.existsSync(path.join(listing, file))) warn(file, 'is missing; this language shows the default words', {fix: `Run \`npx screenshot-studio locales --init ${locale}\`.`});
      else load<Copy>(file, 'copy');
    }
    const words = readJson<Listing | null>(path.join(listing, locale, 'listing.json'), null);
    for (const [field, max] of words ? LIMITS : []) {
      const value = field === 'title' ? words![field] ?? words!.appName : words![field];
      const length = typeof value === 'string' ? [...value].length : 0;
      if (length > max) error(`${locale}/listing.json`, `${String(field)} has ${length} characters; Play allows ${max}`, {path: String(field)});
    }
  }
  return {ok: !issues.some(issue => issue.level === 'error'), issues, counted};
}

export function formatIssues(result: CheckResult): string {
  const {counted, issues} = result;
  const lines = issues.map(issue => `${issue.level === 'error' ? '✗' : '!'} ${issue.file}${issue.path ? ` ${issue.path}` : ''}: ${issue.message}${issue.fix ? `\n    → ${issue.fix}` : ''}`);
  const errors = issues.filter(i => i.level === 'error').length, warnings = issues.length - errors;
  lines.push(`${lines.length ? '\n' : ''}${counted.galleries} galleries, ${counted.cards} cards, ${counted.captures} captures, ${counted.locales} language(s): ` +
    (issues.length ? `${errors} error(s), ${warnings} warning(s)` : 'all good'));
  return lines.join('\n');
}

/** `check [--json]` */
export async function run(argv: string[]): Promise<number> {
  const at = argv.indexOf('--listing');
  const result = checkListing(at >= 0 ? argv[at + 1] : undefined);
  console.log(argv.includes('--json') ? JSON.stringify(result, null, 2) : formatIssues(result));
  return result.ok ? 0 : 1;
}
