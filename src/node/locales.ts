/**
 * Languages at a glance, and adding new ones.
 *   npx screenshot-studio locales                 coverage: words translated, captures present, layout sidecars
 *   npx screenshot-studio locales --init de-DE    add a locale: empty copy fields to fill in the editor
 * Empty strings count as untranslated: the renderer falls back to the default locale and reports them.
 * localeCoverage() and addLocale() do the same from code.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {Copy} from '../core/types';
import {cardsFor, devicesFor, nodesFile} from '../core/gallery';
import {loadListing, readCopy, writeJson, type ListingFiles, requireListing} from './project';

export interface Tally {
  done: number;
  total: number;
}

export interface LocaleCoverage {
  locale: string;
  isDefault: boolean;
  /** Copy fields with words, out of the default locale's fields. */
  words: Tally;
  /** Captures in <locale>/raw/, out of the captures its galleries use. */
  captures: Tally;
  /** Layout sidecars (<raw>.nodes.json) beside them. */
  sidecars: Tally;
}

export interface CoverageReport {
  defaultLocale: string;
  /** Captures the default locale uses. */
  captures: number;
  /** Copy fields in the default locale. */
  fields: number;
  /** One row per locale in studio.json, in its order. */
  rows: LocaleCoverage[];
}

export interface AddedLocale {
  locale: string;
  /** The locale's copy.json (absolute path). */
  copyFile: string;
  /** Empty fields added to it, to fill in the editor. */
  addedFields: number;
  /** Whether studio.json already listed the locale. */
  alreadyListed: boolean;
}

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const resolveListing = (listing?: string): string => requireListing(listing);

/** Every capture a locale's cards draw (device screens and callout crops); galleries marked defaultLocaleOnly count only for the default. */
function capturesFor({galleries, profiles, defaultLocale}: ListingFiles, locale: string): Set<string> {
  return new Set(Object.keys(galleries)
    .filter(kind => locale === defaultLocale || !profiles[kind]?.defaultLocaleOnly)
    .flatMap(kind => cardsFor(galleries, kind).flatMap(card => [
      ...devicesFor(card).map(device => device.raw),
      ...(card.callouts || []).map(callout => callout.raw).filter((raw): raw is string => Boolean(raw)),
    ])));
}

/** The captures this locale's callouts lift their regions from. */
const mapped = ({galleries, profiles, defaultLocale}: ListingFiles, locale: string): string[] => [...new Set(Object.keys(galleries)
  .filter(kind => locale === defaultLocale || !profiles[kind]?.defaultLocaleOnly)
  .flatMap(kind => cardsFor(galleries, kind).flatMap(card => (card.callouts || []).map(c => c.raw || devicesFor(card)[c.device || 0]?.raw).filter((raw): raw is string => !!raw))))];

const fieldCount = (copy: Copy): number => Object.values(copy).reduce((n, entry) => n + Object.keys(entry).length, 0);

/** How far each locale is: words translated, captures present and layout sidecars beside them. */
export function localeCoverage(listing?: string): CoverageReport {
  const files = loadListing(resolveListing(listing));
  const {defaultLocale, locales} = files;
  const defaultCopy = readCopy(files.listing, defaultLocale);
  const fields = fieldCount(defaultCopy);
  const rows = locales.map((locale): LocaleCoverage => {
    const raws = [...capturesFor(files, locale)];
    const copy = readCopy(files.listing, locale);
    let done = 0;
    for (const [key, entry] of Object.entries(defaultCopy)) {
      for (const field of Object.keys(entry)) if (copy[key]?.[field]?.trim()) done++;
    }
    const exists = (file: string) => fs.existsSync(path.join(files.listing, locale, 'raw', file));
    return {
      locale,
      isDefault: locale === defaultLocale,
      words: {done, total: fields},
      captures: {done: raws.filter(raw => exists(raw)).length, total: raws.length},
      // Layout maps matter only for the captures callouts lift from, to follow their element into this language.
      sidecars: {done: mapped(files, locale).filter(raw => exists(nodesFile(raw))).length, total: mapped(files, locale).length},
    };
  });
  return {defaultLocale, captures: capturesFor(files, defaultLocale).size, fields, rows};
}

/** The coverage table `locales` prints. */
export function formatCoverage(report: CoverageReport): string {
  const tally = ({done, total}: Tally) => `${done}/${total}`;
  return [
    `${report.captures} captures and ${report.fields} copy fields per locale (default ${report.defaultLocale})`,
    '',
    'locale      words        captures     layout maps (for callouts)',
    ...report.rows.map(row => `${row.locale.padEnd(10)}  ${tally(row.words).padEnd(11)}  ${tally(row.captures).padEnd(11)}  ${tally(row.sidecars)}`),
  ].join('\n');
}

/** Add a locale to studio.json and give it every default-locale copy field, empty (existing words are kept). */
export function addLocale(locale: string, listing?: string): AddedLocale {
  if (!LOCALE.test(locale)) throw new Error(`"${locale}" is not a locale code; use one like de-DE or pt-BR.`);
  const files = loadListing(resolveListing(listing));
  const {defaultLocale, locales} = files;
  const copyFile = path.join(files.listing, locale, 'copy.json');
  const copy = readCopy(files.listing, locale);
  let addedFields = 0;
  for (const [key, entry] of Object.entries(readCopy(files.listing, defaultLocale))) {
    const target = copy[key] ||= {};
    for (const field of Object.keys(entry)) if (!(field in target)) { target[field] = ''; addedFields++; }
  }
  writeJson(copyFile, copy);
  const alreadyListed = locales.includes(locale);
  if (!alreadyListed) writeJson(path.join(files.listing, 'studio.json'), {...files.config, locales: [...locales, locale]});
  return {locale, copyFile, addedFields, alreadyListed};
}

const USAGE = `Usage:
  npx screenshot-studio locales                 words translated, captures present and layout sidecars per locale
  npx screenshot-studio locales --init de-DE    add a locale with empty copy fields to fill in the editor`;

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
  try {
    if (argv[0] === '--init') {
      if (argv.length !== 2) { console.error(USAGE); return 1; }
      const added = addLocale(argv[1]);
      console.log(`Added ${added.locale}: fill ${path.relative(process.cwd(), added.copyFile)} in the editor, and capture into ${added.locale}/raw/.`);
      return 0;
    }
    if (argv.length) { console.error(USAGE); return 1; }
    console.log(formatCoverage(localeCoverage()));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
