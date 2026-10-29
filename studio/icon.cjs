/**
 * The icon factory: one drawing, every icon an app ships.
 *   PLAYWRIGHT_MODULE=… node store-listing/studio/icon.cjs [store-listing/brand/icon.json]
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
 * Shapes: "square" (full bleed; Play and app stores mask their own), "rounded" (a 22% corner, like a
 * launcher), "circle", and "mark" (the foreground alone, on transparent). A path ending in .svg is
 * written as vector, .ico holds 16-256px PNG entries, .icns is built with macOS's iconutil, and any
 * other path is a PNG of the given size.
 *
 * Android gets adaptive icons from bitmap layers at every density (foreground, background and, when
 * monochrome.svg exists, a themed-icon layer), plus ic_launcher and ic_launcher_round PNGs for older
 * launchers when "legacy" is true. Every run also writes store-listing/brand/icon-preview.png: the icon
 * in every shape, at launcher sizes on light and dark, and themed, to check it at a glance.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const specFile = path.resolve(process.argv[2] || path.join(__dirname, '..', 'brand', 'icon.json'));
const brand = path.dirname(specFile);
const root = path.resolve(brand, '..', '..');
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const rel = file => path.relative(root, file);

/** A layer's inner markup, with its ids prefixed so layers can share one document. */
function layer(name, required = true) {
  const file = path.join(brand, `${name}.svg`);
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`Missing ${rel(file)}`);
    return null;
  }
  const text = fs.readFileSync(file, 'utf8');
  const open = text.match(/<svg\b[^>]*>/);
  if (!open || !/viewBox="0 0 108 108"/.test(open[0])) throw new Error(`${rel(file)} must be an <svg viewBox="0 0 108 108">`);
  const inner = text.slice(open.index + open[0].length, text.lastIndexOf('</svg>'));
  return inner
    .replace(/\bid="([^"]+)"/g, `id="${name}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${name}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${name}-$1"`);
}
const background = layer('background');
const foreground = layer('foreground');
const monochrome = layer('monochrome', false);

const CLIP = {
  square: '<rect x="18" y="18" width="72" height="72"/>',
  rounded: '<rect x="18" y="18" width="72" height="72" rx="16"/>',
  circle: '<circle cx="54" cy="54" r="36"/>',
};
/** The icon as one SVG document, showing the launcher's visible 72 x 72. */
function icon(shape) {
  if (shape === 'mark') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${foreground}</svg>\n`;
  if (!CLIP[shape]) throw new Error(`Unknown shape "${shape}"; use square, rounded, circle or mark`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><defs><clipPath id="icon-shape">${CLIP[shape]}</clipPath></defs><g clip-path="url(#icon-shape)">${background}${foreground}</g></svg>\n`;
}
/** A single layer on the full 108 canvas, as Android's adaptive icon expects. */
const canvas = inner => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${inner}</svg>`;

function write(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, data);
  console.log(rel(file));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function raster(svg, size) {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block">`);
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    return page.screenshot({omitBackground: true, clip: {x: 0, y: 0, width: size, height: size}});
  }

  if (spec.android) {
    const res = path.join(root, spec.android.res);
    const name = spec.android.name || 'ic_launcher';
    const densities = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};
    for (const [density, factor] of Object.entries(densities)) {
      const dir = path.join(res, `mipmap-${density}`);
      write(path.join(dir, `${name}_foreground.png`), await raster(canvas(foreground), 108 * factor));
      write(path.join(dir, `${name}_background.png`), await raster(canvas(background), 108 * factor));
      if (monochrome) write(path.join(dir, `${name}_monochrome.png`), await raster(canvas(monochrome), 108 * factor));
      if (spec.android.legacy) {
        write(path.join(dir, `${name}.png`), await raster(icon('rounded'), 48 * factor));
        write(path.join(dir, `${name}_round.png`), await raster(icon('circle'), 48 * factor));
      }
    }
    const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by store-listing/studio/icon.cjs from store-listing/brand. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${name}_background" />
    <foreground android:drawable="@mipmap/${name}_foreground" />
${monochrome ? `    <monochrome android:drawable="@mipmap/${name}_monochrome" />\n` : ''}</adaptive-icon>
`;
    write(path.join(res, `mipmap-anydpi-v26/${name}.xml`), adaptive);
    write(path.join(res, `mipmap-anydpi-v26/${name}_round.xml`), adaptive);
  }

  for (const target of spec.files || []) {
    const file = path.join(root, target.path);
    const shape = target.shape || 'rounded';
    if (file.endsWith('.svg')) {
      write(file, icon(shape));
    } else if (file.endsWith('.ico')) {
      // PNG-compressed entries keep every Windows size crisp.
      const sizes = [16, 24, 32, 48, 64, 128, 256];
      const images = [];
      for (const size of sizes) images.push(await raster(icon(shape), size));
      const header = Buffer.alloc(6 + sizes.length * 16);
      header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
      let offset = header.length;
      sizes.forEach((size, i) => {
        const at = 6 + i * 16;
        header.writeUInt8(size === 256 ? 0 : size, at); header.writeUInt8(size === 256 ? 0 : size, at + 1);
        header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
        header.writeUInt32LE(images[i].length, at + 8); header.writeUInt32LE(offset, at + 12);
        offset += images[i].length;
      });
      write(file, Buffer.concat([header, ...images]));
    } else if (file.endsWith('.icns')) {
      if (process.platform !== 'darwin') { console.warn(`Skipped ${target.path}: iconutil needs macOS`); continue; }
      const set = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-')) + '/AppIcon.iconset';
      fs.mkdirSync(set);
      for (const size of [16, 32, 128, 256, 512]) {
        fs.writeFileSync(path.join(set, `icon_${size}x${size}.png`), await raster(icon(shape), size));
        fs.writeFileSync(path.join(set, `icon_${size}x${size}@2x.png`), await raster(icon(shape), size * 2));
      }
      fs.mkdirSync(path.dirname(file), {recursive: true});
      execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', file, set]);
      console.log(rel(file));
    } else {
      if (!target.size) throw new Error(`${target.path} needs a "size"`);
      write(file, await raster(icon(shape), target.size));
    }
  }

  // The preview: every shape large, launcher sizes on light and dark, and the themed icon.
  const img = (svg, size) => `<img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
  const themed = monochrome
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><circle cx="54" cy="54" r="36" fill="#3b4a3a"/><g style="filter:brightness(0) invert(.9) sepia(.3) hue-rotate(60deg)">${monochrome}</g></svg>`
    : null;
  const row = (bg, sizes) => `<div style="background:${bg};border-radius:18px;padding:18px;display:flex;gap:18px;align-items:end">${sizes.map(([s, shape]) => img(icon(shape), s)).join('')}${themed ? img(themed, sizes[0][0]) : ''}</div>`;
  await page.setViewportSize({width: 1200, height: 600});
  await page.setContent(`<body style="margin:0;padding:24px;background:#fff;font:14px sans-serif;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;gap:24px;align-items:end">${img(icon('square'), 220)}${img(icon('rounded'), 180)}${img(icon('circle'), 180)}${img(icon('mark'), 180)}</div>
    ${row('#ece6e2', [[72, 'rounded'], [48, 'circle'], [32, 'rounded'], [16, 'rounded']])}
    ${row('#1d1b20', [[72, 'rounded'], [48, 'circle'], [32, 'rounded'], [16, 'rounded']])}
  </body>`);
  await page.waitForTimeout(200);
  write(path.join(brand, 'icon-preview.png'), await page.screenshot({fullPage: true}));
  await browser.close();
})().catch(error => { console.error(error.message); process.exit(1); });
