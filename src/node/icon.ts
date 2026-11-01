/**
 * The icon factory: one drawing, every icon an app ships.
 *   npx screenshot-studio icons [store-listing/brand/icon.json]
 *   npx screenshot-studio icons --import drawable.xml > store-listing/brand/foreground.svg
 * Needs Playwright (set PLAYWRIGHT_MODULE to an existing installation if it is not resolvable from here).
 *
 * An app draws its icon once, as SVG layers on Android's 108 x 108 adaptive canvas (launchers show the
 * middle 72, from 18 to 90; keep the mark inside the 66-wide safe circle centred on 54, 54):
 *   store-listing/brand/background.svg   the full-bleed ground
 *   store-listing/brand/foreground.svg   the mark, on transparent
 *   store-listing/brand/monochrome.svg   the mark in one colour, for Android's themed icons (optional)
 * and lists where the icons go in store-listing/brand/icon.json, with paths from the repository root:
 *   {
 *     "android": {"res": "app/src/main/res", "legacy": true},
 *     "files": [
 *       {"path": "store-listing/brand/icon.png", "size": 512, "shape": "square"},
 *       {"path": "web/favicon.svg", "shape": "circle"},
 *       {"path": "web/favicon.ico", "shape": "rounded"},
 *       {"path": "desktop/AppIcon.icns", "shape": "rounded"}
 *     ]
 *   }
 * "opaque": true writes a PNG with no transparency (Apple's 1024px App Store icon must be opaque).
 * A target's "scale" grows or shrinks the mark on its ground (an Apple icon shows the whole square, so
 * its mark is usually larger than Android's safe zone allows). Shapes: "square" (full bleed; Play and app stores mask their own), "rounded" (a 22% corner, like a
 * launcher), "circle", and "mark" (the foreground alone, on transparent); {"layer": "name"} draws one
 * extra layer, brand/name.svg, alone. A path ending in .svg is written as vector, .ico holds 16-256px
 * PNG entries, .icns is built with macOS's iconutil, and any other path is a PNG of the given size.
 * A path ending in .icon is an Apple Icon Composer icon: {"path": "ios/AppIcon.icon", "apple":
 * {"Background": "background", "Mark": "foreground"}} writes each layer as Assets/<Name>.png at 1024px
 * (glass layers stay separate, so iOS can light them), keeps an existing icon.json (its glass, dark and
 * tinted settings are tuned in Icon Composer) or writes a plain one, and checks it with Xcode's ictool.
 *
 * An existing Android vector drawable can become a layer as is: `npx screenshot-studio icons --import
 * drawable.xml > brand/foreground.svg` (paths, groups, clips, alphas and gradients).
 *
 * Layers may embed bitmap art: an <image href="art.png"> beside the SVG is inlined when it is read.
 * An app with several icons (launcher shortcuts, say) lists them as {"icons": [{"layers": "todo",
 * "android": {...}, "files": [...]}, ...]}, each drawn in its own brand/<layers>/ folder; a layer missing
 * there comes from brand/ itself, so a variant (a build flavour's tinted ground) redraws only what changes; "monochrome": false on an
 * icon leaves out the themed layer.
 *
 * Android gets adaptive icons from bitmap layers at every density (foreground, background and, when
 * monochrome.svg exists, a themed-icon layer), plus ic_launcher and ic_launcher_round PNGs for older
 * launchers when "legacy" is true. "name" (default ic_launcher) and "type" ("mipmap", the default, or
 * "drawable") match what the manifest refers to. Every run also writes store-listing/brand/icon-preview.png: the icon
 * in every shape, at launcher sizes on light and dark, and themed, to check it at a glance.
 * buildIcons() does the same from code and returns every file it wrote.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import type {Page} from 'playwright';
import {readJson} from './project';

type Shape = 'square' | 'rounded' | 'circle' | 'mark';
/** Where Android's launcher icons go. */
interface AndroidTarget {
  /** The res folder, from the repository root. */
  res: string;
  /** Also write ic_launcher (and ic_launcher_round) PNGs for launchers without adaptive icons. */
  legacy?: boolean;
  /** false leaves out the round icon. */
  round?: boolean;
  name?: string;
  type?: 'mipmap' | 'drawable';
}
interface FileTarget {
  path: string;
  size?: number;
  shape?: Shape;
  scale?: number;
  opaque?: boolean;
  /** One extra layer, brand/<layer>.svg, drawn alone. */
  layer?: string;
  /** For a .icon: Icon Composer layer names and the brand layer each draws. */
  apple?: Record<string, string>;
}
/** One icon: its layers folder under brand/ and every target it is written to. */
interface IconJob {
  layers?: string;
  monochrome?: boolean;
  android?: AndroidTarget;
  files?: FileTarget[];
}
/** store-listing/brand/icon.json: one icon, or several under "icons". */
type IconSpec = IconJob & {icons?: IconJob[]};
type Attributes = Record<string, string>;

/** Android VectorDrawable XML as an SVG on the 108 canvas: `npx screenshot-studio icons --import drawable.xml > layer.svg`. */
export function importVector(file: string): string {
  const text = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const attrs = (tag: string): Attributes => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1].replace(/^android:/, ''), m[2]]));
  const colour = (value: string | undefined, alpha = 1): [string, number] => {
    if (!value || value === '@android:color/transparent') return ['none', 1];
    let hex = value.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 4) hex = hex.split('').map(c => c + c).join('');
    let a = 1;
    if (hex.length === 8) { a = parseInt(hex.slice(0, 2), 16) / 255; hex = hex.slice(2); }
    return [`#${hex}`, +(a * alpha).toFixed(3)];
  };
  const vector = text.match(/<vector\b[^>]*>/);
  if (!vector) throw new Error(`${path.basename(file)} is not an Android vector drawable`);
  const root = attrs(vector[0]);
  const vw = parseFloat(root.viewportWidth), vh = parseFloat(root.viewportHeight);
  let out = '', ids = 0;
  const defs: string[] = [];
  const tokens: string[] = text.match(/<\/?(group|path|clip-path|aapt:attr|gradient|item)\b[^>]*>/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], a = attrs(token);
    if (token.startsWith('</group')) { out += '</g>'; continue; }
    if (token.startsWith('<group')) {
      const px = +(a.pivotX || 0), py = +(a.pivotY || 0);
      const t = [`translate(${+(a.translateX || 0) + px} ${+(a.translateY || 0) + py})`, `rotate(${a.rotation || 0})`, `scale(${a.scaleX || 1} ${a.scaleY || 1})`, `translate(${-px} ${-py})`];
      out += `<g transform="${t.join(' ')}">`;
      if (token.endsWith('/>')) out += '</g>';
    } else if (token.startsWith('<clip-path')) {
      const id = `clip${ids++}`;
      defs.push(`<clipPath id="${id}"><path d="${a.pathData}"/></clipPath>`);
      out += `<g clip-path="url(#${id})">`;
      // A clip applies to the rest of its group; close it when the group closes.
      let depth = 0;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith('<group') && !tokens[j].endsWith('/>')) depth++;
        if (tokens[j].startsWith('</group')) { if (depth === 0) { tokens.splice(j, 0, '</groupclip>'); break; } depth--; }
      }
    } else if (token === '</groupclip>') {
      out += '</g>';
    } else if (token.startsWith('<path')) {
      let fill = colour(a.fillColor, +(a.fillAlpha ?? 1)), stroke = colour(a.strokeColor, +(a.strokeAlpha ?? 1));
      // A gradient fill or stroke follows as <aapt:attr name="android:fillColor"><gradient …><item …/></gradient>.
      if (!token.endsWith('/>')) {
        for (let j = i + 1; j < tokens.length && !tokens[j].startsWith('</path'); j++) {
          const attr = tokens[j].match(/name="android:(fillColor|strokeColor)"/);
          if (!attr) continue;
          const g = attrs(tokens[j + 1]), id = `grad${ids++}`, stops: string[] = [];
          for (let k = j + 2; k < tokens.length && tokens[k].startsWith('<item'); k++) {
            const item = attrs(tokens[k]), [c, o] = colour(item.color);
            stops.push(`<stop offset="${item.offset}" stop-color="${c}" stop-opacity="${o}"/>`);
          }
          defs.push(g.type === 'radial'
            ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${g.centerX}" cy="${g.centerY}" r="${g.gradientRadius}">${stops.join('')}</radialGradient>`
            : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.startX}" y1="${g.startY}" x2="${g.endX}" y2="${g.endY}">${stops.join('')}</linearGradient>`);
          if (attr[1] === 'fillColor') fill = [`url(#${id})`, 1]; else stroke = [`url(#${id})`, 1];
        }
      }
      const parts = [`d="${a.pathData}"`, `fill="${fill[0]}"`];
      if (fill[1] !== 1) parts.push(`fill-opacity="${fill[1]}"`);
      if (a.fillType === 'evenOdd') parts.push('fill-rule="evenodd"');
      if (stroke[0] !== 'none' && +(a.strokeWidth ?? 0) > 0) {
        parts.push(`stroke="${stroke[0]}"`, `stroke-width="${a.strokeWidth}"`);
        if (stroke[1] !== 1) parts.push(`stroke-opacity="${stroke[1]}"`);
        if (a.strokeLineCap) parts.push(`stroke-linecap="${a.strokeLineCap}"`);
        if (a.strokeLineJoin) parts.push(`stroke-linejoin="${a.strokeLineJoin}"`);
        if (a.strokeMiterLimit) parts.push(`stroke-miterlimit="${a.strokeMiterLimit}"`);
      }
      out += `<path ${parts.join(' ')}/>`;
    }
  }
  const scale = `scale(${108 / vw} ${108 / vh})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">\n  <!-- Imported from ${path.basename(file)}. -->\n  <defs>${defs.join('')}</defs>\n  <g transform="${scale}">${out}</g>\n</svg>\n`;
}

const MIME: Record<string, string> = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'};
const CLIP: Record<string, string> = {
  square: '<rect x="18" y="18" width="72" height="72"/>',
  rounded: '<rect x="18" y="18" width="72" height="72" rx="16"/>',
  circle: '<circle cx="54" cy="54" r="36"/>',
};
const DENSITIES: Record<string, number> = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** A single layer on the full 108 canvas, as Android's adaptive icon expects. */
const canvas = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${inner}</svg>`;
/** Markup drawn alone on the launcher's visible 72 x 72. */
const visible = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${inner}</svg>\n`;
const dataUri = (svg: string): string => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export interface IconOptions {
  /** brand/icon.json (default: <listing>/brand/icon.json). Target paths in it are from the repository root, two folders up. */
  spec?: string;
  /** The store-listing folder (default: the one this studio copy lives in). */
  listing?: string;
  /** One line per file written (default: console.log). */
  log?: (line: string) => void;
}

export interface IconResult {
  /** Every file written, relative to the repository root. */
  written: string[];
}

/** Draw every icon brand/icon.json lists, plus brand/icon-preview.png (one per icon). */
export async function buildIcons(options: IconOptions = {}): Promise<IconResult> {
  const log = options.log || ((line: string) => console.log(line));
  const listing = options.listing ? path.resolve(options.listing) : path.resolve(__dirname, '..');
  const specFile = options.spec ? path.resolve(options.spec) : path.join(listing, 'brand', 'icon.json');
  if (!fs.existsSync(specFile)) {
    throw new Error(`No ${specFile}. Draw brand/background.svg and brand/foreground.svg, then list the targets in brand/icon.json.`);
  }
  const brand = path.dirname(specFile);
  const root = path.resolve(brand, '..', '..');
  const spec = readJson<IconSpec>(specFile);
  const rel = (file: string): string => path.relative(root, file);
  const written: string[] = [];

  function write(file: string, data: string | Buffer): void {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, data);
    written.push(rel(file));
    log(rel(file));
  }

  /** A layer's inner markup, ids prefixed so layers can share one document, bitmap art inlined. */
  function readLayer(dir: string, name: string): string;
  function readLayer(dir: string, name: string, required: boolean): string | null;
  function readLayer(dir: string, name: string, required = true): string | null {
    // A variant folder (an alpha build's icon, say) redraws only what changes and inherits the rest.
    let file = path.join(dir, `${name}.svg`);
    if (!fs.existsSync(file) && dir !== brand) file = path.join(brand, `${name}.svg`);
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`Missing ${rel(file)}`);
      return null;
    }
    const folder = path.dirname(file);
    const text = fs.readFileSync(file, 'utf8');
    const open = text.match(/<svg\b[^>]*>/);
    if (!open || !/viewBox="0 0 108 108"/.test(open[0])) throw new Error(`${rel(file)} must be an <svg viewBox="0 0 108 108">`);
    const prefix = name.replace(/[^a-z0-9]/gi, '');
    return text.slice(open.index! + open[0].length, text.lastIndexOf('</svg>'))
      .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
      .replace(/(xlink:)?href="#([^"]+)"/g, `href="#${prefix}-$2"`)
      .replace(/(xlink:)?href="(?!#|data:|https?:)([^"]+)"/g, (_: string, __: string | undefined, art: string) => {
        const source = path.join(folder, art);
        if (!fs.existsSync(source)) throw new Error(`${rel(file)} embeds ${art}, which is not in ${rel(folder) || '.'}`);
        return `href="data:${MIME[path.extname(art).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(source).toString('base64')}"`;
      });
  }

  // Set once the browser is up; every drawing below runs after that.
  let page: Page;
  const raster = async (svg: string, size: number, opaque = false): Promise<Buffer> => {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${dataUri(svg)}" width="${size}" height="${size}" style="display:block">`);
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    return page.screenshot({omitBackground: !opaque, clip: {x: 0, y: 0, width: size, height: size}});
  };

  const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright') as typeof import('playwright');
  const browser = await chromium.launch();
  try {
    page = await browser.newPage();
    for (const job of spec.icons || [spec]) {
      const dir = path.join(brand, job.layers || '.');
      const background = readLayer(dir, 'background');
      const foreground = readLayer(dir, 'foreground');
      const monochrome = job.monochrome === false ? null : readLayer(dir, 'monochrome', false);
      /** The icon as one SVG document, showing the launcher's visible 72 x 72. */
      const icon = (shape: Shape, scale = 1): string => {
        const mark = scale === 1 ? foreground : `<g transform="translate(54 54) scale(${scale}) translate(-54 -54)">${foreground}</g>`;
        if (shape === 'mark') return visible(mark);
        if (!CLIP[shape]) throw new Error(`Unknown shape "${shape}"; use square, rounded, circle or mark`);
        return visible(`<defs><clipPath id="icon-shape">${CLIP[shape]}</clipPath></defs><g clip-path="url(#icon-shape)">${background}${mark}</g>`);
      };

      if (job.android) await writeAndroid(job.android, {background, foreground, monochrome}, icon);
      for (const target of job.files || []) await writeFile(target, dir, icon);
      await writePreview(dir, icon, monochrome);
    }
  } finally {
    await browser.close();
  }
  return {written};

  async function writeAndroid(android: AndroidTarget, layers: {background: string; foreground: string; monochrome: string | null},
    icon: (shape: Shape) => string): Promise<void> {
    const res = path.join(root, android.res);
    const name = android.name || 'ic_launcher';
    const type = android.type || 'mipmap';
    const round = android.round !== false;
    const parts = (['background', 'foreground', 'monochrome'] as const).filter(part => layers[part] !== null);
    for (const [density, factor] of Object.entries(DENSITIES)) {
      const folder = path.join(res, `${type}-${density}`);
      for (const part of parts) write(path.join(folder, `${name}_${part}.png`), await raster(canvas(layers[part]!), 108 * factor));
      if (android.legacy) {
        write(path.join(folder, `${name}.png`), await raster(icon('rounded'), 48 * factor));
        if (round) write(path.join(folder, `${name}_round.png`), await raster(icon('circle'), 48 * factor));
      }
    }
    const adaptive = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- Generated by `npx screenshot-studio icons` from store-listing/brand. -->',
      '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
      ...parts.map(part => `    <${part} android:drawable="@${type}/${name}_${part}" />`),
      '</adaptive-icon>', '',
    ].join('\n');
    write(path.join(res, `${type}-anydpi-v26/${name}.xml`), adaptive);
    if (round) write(path.join(res, `${type}-anydpi-v26/${name}_round.xml`), adaptive);
  }

  async function writeFile(target: FileTarget, dir: string, icon: (shape: Shape, scale?: number) => string): Promise<void> {
    const file = path.join(root, target.path);
    const draw = () => icon(target.shape || 'rounded', target.scale || 1);
    const size = () => {
      if (!target.size) throw new Error(`${target.path} in ${rel(specFile)} needs a "size"`);
      return target.size;
    };
    if (file.endsWith('.icon')) {
      await writeAppleIcon(file, target.apple || {Background: 'background', Mark: 'foreground'}, dir);
    } else if (target.layer) {
      write(file, await raster(visible(readLayer(dir, target.layer)), size()));
    } else if (file.endsWith('.svg')) {
      write(file, draw());
    } else if (file.endsWith('.ico')) {
      const images: Buffer[] = [];
      for (const s of ICO_SIZES) images.push(await raster(draw(), s));
      write(file, ico(images));
    } else if (file.endsWith('.icns')) {
      if (process.platform !== 'darwin') { log(`Skipped ${target.path}: iconutil needs macOS`); return; }
      const set = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')), 'AppIcon.iconset');
      fs.mkdirSync(set);
      for (const s of [16, 32, 128, 256, 512]) {
        fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), await raster(draw(), s));
        fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), await raster(draw(), s * 2));
      }
      fs.mkdirSync(path.dirname(file), {recursive: true});
      execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', file, set]);
      written.push(rel(file));
      log(rel(file));
    } else {
      write(file, await raster(draw(), size(), target.opaque));
    }
  }

  async function writeAppleIcon(bundle: string, layers: Record<string, string>, dir: string): Promise<void> {
    for (const [name, layerName] of Object.entries(layers)) {
      // The background fills the square; every other layer floats on transparent for the glass.
      write(path.join(bundle, 'Assets', `${name}.png`), await raster(visible(readLayer(dir, layerName)), 1024));
    }
    const json = path.join(bundle, 'icon.json');
    if (!fs.existsSync(json)) {
      const names = Object.keys(layers).filter(name => layers[name] !== 'background');
      write(json, JSON.stringify({
        groups: [{layers: [...names.map(name => ({'image-name': `${name}.png`, name})),
          ...(Object.values(layers).includes('background') ? [{'image-name': 'Background.png', name: 'Background', glass: false}] : [])],
          shadow: {kind: 'neutral', opacity: 0.3}, translucency: {enabled: true, value: 0.15}}],
        'supported-platforms': {squares: 'shared'},
      }, null, 2) + '\n');
    }
    if (process.platform === 'darwin' && fs.existsSync('/usr/bin/xcrun')) {
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-icon-'));
      try {
        execFileSync('/usr/bin/xcrun', ['ictool', bundle, '--compile', out, '--platform', 'iphoneos', '--minimum-deployment-target', '26.0'], {stdio: 'pipe'});
      } catch (error) {
        const failure = error as {stderr?: Buffer | string; message: string};
        throw new Error(`Xcode rejected ${rel(bundle)}: ${failure.stderr || failure.message}`);
      }
    }
  }

  // The preview: every shape large, launcher sizes on light and dark, and the themed icon.
  async function writePreview(dir: string, icon: (shape: Shape) => string, monochrome: string | null): Promise<void> {
    const img = (svg: string, size: number): string => `<img width="${size}" height="${size}" src="${dataUri(svg)}">`;
    const themed = monochrome
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><circle cx="54" cy="54" r="36" fill="#3b4a3a"/><g style="filter:brightness(0) invert(.9) sepia(.3) hue-rotate(60deg)">${monochrome}</g></svg>`
      : null;
    const sizes: [number, Shape][] = [[72, 'rounded'], [48, 'circle'], [32, 'rounded'], [16, 'rounded']];
    const row = (bg: string): string => `<div style="background:${bg};border-radius:18px;padding:18px;display:flex;gap:18px;align-items:end">${sizes.map(([s, shape]) => img(icon(shape), s)).join('')}${themed ? img(themed, sizes[0][0]) : ''}</div>`;
    await page.setViewportSize({width: 1200, height: 600});
    await page.setContent(`<body style="margin:0;padding:24px;background:#fff;font:14px sans-serif;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;gap:24px;align-items:end">${img(icon('square'), 220)}${img(icon('rounded'), 180)}${img(icon('circle'), 180)}${img(icon('mark'), 180)}</div>
      ${row('#ece6e2')}
      ${row('#1d1b20')}
    </body>`);
    await page.waitForTimeout(200);
    write(path.join(dir, 'icon-preview.png'), await page.screenshot({fullPage: true}));
  }
}

/** A Windows .ico of PNG-compressed entries (they keep every size crisp), in ICO_SIZES order. */
function ico(images: Buffer[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const size = ICO_SIZES[i], at = 6 + i * 16;
    header.writeUInt8(size === 256 ? 0 : size, at); header.writeUInt8(size === 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...images]);
}

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
