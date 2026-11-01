/** Finding and reading an app's store-listing folder: the one place every command loads it from. */
import fs from 'node:fs';
import path from 'node:path';
import type {Copy, Galleries, Profiles, StudioConfig} from '../core/types';
import {withoutMeta} from '../core/gallery';

/** Read a studio file (without its "$schema"), or `fallback` when it doesn't exist. Invalid JSON always throws. */
export function readJson<T>(file: string, fallback?: T): T {
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
  try { return withoutMeta(JSON.parse(text) as T); }
  catch (error) { throw new Error(`${file} is not valid JSON: ${(error as Error).message}`); }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export interface ListingFiles {
  /** The store-listing folder. */
  listing: string;
  /** The repository it belongs to. */
  repo: string;
  config: StudioConfig;
  profiles: Profiles;
  galleries: Galleries;
  defaultLocale: string;
  locales: string[];
}

/** Load studio.json, profiles.json and gallery.json, with errors that say which file to fix. */
export function loadListing(listing: string): ListingFiles {
  if (!fs.existsSync(path.join(listing, 'studio.json'))) throw new Error(`No studio.json in ${listing}. Run \`npx screenshot-studio init\` in the app first.`);
  const config = readJson<StudioConfig>(path.join(listing, 'studio.json'));
  const profiles = readJson<Profiles>(path.join(listing, 'profiles.json'));
  const galleries = readJson<Galleries>(path.join(listing, 'gallery.json'));
  for (const kind of Object.keys(galleries)) if (!profiles[kind]) throw new Error(`gallery.json has a "${kind}" gallery but profiles.json has no "${kind}" profile.`);
  const defaultLocale = config.defaultLocale || 'en-US';
  return {listing, repo: path.dirname(listing), config, profiles, galleries, defaultLocale, locales: config.locales || [defaultLocale]};
}

export const readCopy = (listing: string, locale: string): Copy => readJson<Copy>(path.join(listing, locale, 'copy.json'), {});

/** The studio's own files (renderer, editor, schemas, capture): the folder this bundle runs from. */
export const STUDIO_DIR = __dirname;

/**
 * The store-listing folder for a command: an explicit path (an app folder or its store-listing), else the nearest
 * store-listing/ at or above the working directory.
 */
export function findListing(explicit?: string, from = process.cwd()): string | null {
  const resolve = (dir: string) => {
    if (fs.existsSync(path.join(dir, 'studio.json'))) return dir;
    if (fs.existsSync(path.join(dir, 'store-listing', 'studio.json'))) return path.join(dir, 'store-listing');
    return null;
  };
  if (explicit) return resolve(path.resolve(explicit));
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const found = resolve(dir);
    if (found) return found;
    if (path.dirname(dir) === dir) return null;
  }
}

/** findListing, or an error that says how to get one. */
export function requireListing(explicit?: string): string {
  const found = findListing(explicit);
  if (found) return found;
  throw new Error(explicit
    ? `No store-listing/studio.json in ${path.resolve(explicit)}.`
    : 'No store-listing/studio.json here or in any folder above. Run this in your app, or set it up with `npx screenshot-studio init`.');
}
