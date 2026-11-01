/** buildIcons(): every icon brand/icon.json lists, drawn in a headless browser. */
import fs from 'node:fs';
import path from 'node:path';
import type {Page} from 'playwright';
import {readJson, requireListing} from '../project';
import {launchBrowser} from '../playwright';
import {composeIcon, dataUri} from './compose';
import {layerFile, readLayer} from './layers';
import {writeAndroid, writeFile, writePreview, type Icon, type Output} from './targets';
import type {IconJob, IconOptions, IconResult, IconSpec} from './types';

/** Draw every icon brand/icon.json lists, plus brand/icon-preview.png (one per icon). */
export async function buildIcons(options: IconOptions = {}): Promise<IconResult> {
  const log = options.log || ((line: string) => console.log(line));
  const listing = requireListing(options.listing);
  const specFile = options.spec ? path.resolve(options.spec) : path.join(listing, 'brand', 'icon.json');
  if (!fs.existsSync(specFile)) {
    throw new Error(`No ${specFile}. Draw brand/background.svg and brand/foreground.svg, then list the targets in brand/icon.json.`);
  }
  const brand = path.dirname(specFile);
  const root = path.resolve(brand, '..', '..');
  const spec = readJson<IconSpec>(specFile);
  const rel = (file: string): string => path.relative(root, file);
  const written: string[] = [];

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const out: Output = {
      root, spec: specFile, page, rel, log,
      write(file, data) {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, data);
        this.wrote(file);
      },
      wrote(file) {
        written.push(rel(file));
        log(rel(file));
      },
      raster: (svg, size, opaque) => raster(page, svg, size, opaque),
    };
    for (const job of spec.icons || [spec]) {
      const icon = loadIcon(brand, job, rel);
      if (job.android) await writeAndroid(out, job.android, icon);
      for (const target of job.files || []) await writeFile(out, target, icon);
      await writePreview(out, icon);
    }
  } finally {
    await browser.close();
  }
  return {written};
}

/** One icon's layers, from its folder under brand/ or brand/ itself. */
function loadIcon(brand: string, job: IconJob, rel: (file: string) => string): Icon {
  const dir = path.join(brand, job.layers || '.');
  const optional = (name: string): string | null => {
    const file = layerFile(brand, dir, name);
    return fs.existsSync(file) ? readLayer(file, name, rel) : null;
  };
  const layer = (name: string): string => {
    const markup = optional(name);
    if (markup === null) throw new Error(`Missing ${rel(layerFile(brand, dir, name))}`);
    return markup;
  };
  const background = layer('background');
  const foreground = layer('foreground');
  const monochrome = job.monochrome === false ? null : optional('monochrome');
  return {background, foreground, monochrome, dir, layer, draw: (shape, scale) => composeIcon(background, foreground, shape, scale)};
}

/** An SVG as a size x size PNG, transparent unless opaque. */
async function raster(page: Page, svg: string, size: number, opaque = false): Promise<Buffer> {
  await page.setViewportSize({width: size, height: size});
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${dataUri(svg)}" width="${size}" height="${size}" style="display:block">`);
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  return page.screenshot({omitBackground: !opaque, clip: {x: 0, y: 0, width: size, height: size}});
}
