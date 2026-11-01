/**
 * The icon factory: one drawing, every icon an app ships (docs/icons.md).
 *   npx screenshot-studio icons [store-listing/brand/icon.json]
 *   npx screenshot-studio icons --import drawable.xml > store-listing/brand/foreground.svg
 *
 * An app draws its icon once, as SVG layers on Android's 108 x 108 adaptive canvas in store-listing/brand/
 * (background.svg, foreground.svg and, for themed icons, monochrome.svg), and lists where the icons go in
 * brand/icon.json. The pieces:
 *   build.ts     buildIcons(): reads icon.json, draws each icon in a headless browser
 *   layers.ts    finds and reads an icon's layers (a variant folder falls back to brand/)
 *   compose.ts   layers composed into shapes, the themed icon, the adaptive icon XML
 *   targets.ts   Android resources, PNG/SVG/ICO/ICNS files, Apple Icon Composer bundles, the preview
 *   vector.ts    an Android vector drawable as an SVG layer (--import)
 *   xml.ts       the XML reader vector.ts uses
 */
import path from 'node:path';
import {buildIcons} from './build';
import {importVector} from './vector';

export {buildIcons} from './build';
export {importVector, vectorToSvg} from './vector';
export type {IconOptions, IconResult, IconSpec} from './types';

const USAGE = `Usage:
  npx screenshot-studio icons [store-listing/brand/icon.json]   draw every icon icon.json lists
  npx screenshot-studio icons --import drawable.xml             print an Android vector drawable as a 108 x 108 SVG layer`;

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
  try {
    if (argv[0] === '--import') {
      if (argv.length !== 2) { console.error(USAGE); return 1; }
      process.stdout.write(importVector(path.resolve(argv[1])));
      return 0;
    }
    if (argv.length > 1 || argv.some(arg => arg.startsWith('-'))) { console.error(USAGE); return 1; }
    await buildIcons({spec: argv[0]});
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
