/** Writers for each kind of target icon.json lists: Android resources, image files, Apple icons, and the preview. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import type {Page} from 'playwright';
import {adaptiveIconXml, canvas, dataUri, themedIcon, visible} from './compose';
import type {AndroidTarget, FileTarget, IconJob, Shape} from './types';

/** One run's output: the repository root, a page to draw on, and every file written. */
export interface Output {
  root: string;
  /** icon.json, for messages. */
  spec: string;
  page: Page;
  rel(file: string): string;
  log(line: string): void;
  write(file: string, data: string | Buffer): void;
  /** Record a file a tool wrote itself. */
  wrote(file: string): void;
  raster(svg: string, size: number, opaque?: boolean): Promise<Buffer>;
}

/** One icon's layers, ready to draw. */
export interface Icon {
  background: string;
  foreground: string;
  monochrome: string | null;
  /** brand/ or the icon's variant folder inside it. */
  dir: string;
  draw(shape: Shape, scale?: number): string;
  /** Another layer of this icon, by name. */
  layer(name: string): string;
}

const DENSITIES: Record<string, number> = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Adaptive icon layers at every density, the adaptive icon XML, and legacy PNGs when asked. */
export async function writeAndroid(out: Output, android: AndroidTarget, icon: Icon): Promise<void> {
  const res = path.join(out.root, android.res);
  const name = android.name || 'ic_launcher';
  const type = android.type || 'mipmap';
  const round = android.round !== false;
  const parts = (['background', 'foreground', 'monochrome'] as const).filter(part => icon[part] !== null);
  for (const [density, factor] of Object.entries(DENSITIES)) {
    const folder = path.join(res, `${type}-${density}`);
    for (const part of parts) out.write(path.join(folder, `${name}_${part}.png`), await out.raster(canvas(icon[part]!), 108 * factor));
    if (android.legacy) {
      out.write(path.join(folder, `${name}.png`), await out.raster(icon.draw('rounded'), 48 * factor));
      if (round) out.write(path.join(folder, `${name}_round.png`), await out.raster(icon.draw('circle'), 48 * factor));
    }
  }
  const adaptive = adaptiveIconXml(parts, type, name);
  out.write(path.join(res, `${type}-anydpi-v26/${name}.xml`), adaptive);
  if (round) out.write(path.join(res, `${type}-anydpi-v26/${name}_round.xml`), adaptive);
}

/** One file, by its extension: .icon, .svg, .ico, .icns, or a PNG of its size. */
export async function writeFile(out: Output, target: FileTarget, icon: Icon): Promise<void> {
  const file = path.join(out.root, target.path);
  const draw = () => icon.draw(target.shape || 'rounded', target.scale || 1);
  const size = () => {
    if (!target.size) throw new Error(`${target.path} in ${out.rel(out.spec)} needs a "size"`);
    return target.size;
  };
  if (file.endsWith('.icon')) {
    await writeAppleIcon(out, file, target.apple || {Background: 'background', Mark: 'foreground'}, icon);
  } else if (target.layer) {
    out.write(file, await out.raster(visible(icon.layer(target.layer)), size()));
  } else if (file.endsWith('.svg')) {
    out.write(file, draw());
  } else if (file.endsWith('.ico')) {
    const images: Buffer[] = [];
    for (const s of ICO_SIZES) images.push(await out.raster(draw(), s));
    out.write(file, ico(images));
  } else if (file.endsWith('.icns')) {
    if (process.platform !== 'darwin') { out.log(`Skipped ${target.path}: iconutil needs macOS`); return; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'));
    const set = path.join(tmp, 'AppIcon.iconset');
    try {
      fs.mkdirSync(set);
      for (const s of [16, 32, 128, 256, 512]) {
        fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), await out.raster(draw(), s));
        fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), await out.raster(draw(), s * 2));
      }
      fs.mkdirSync(path.dirname(file), {recursive: true});
      execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', file, set]);
      out.wrote(file);
    } finally {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  } else {
    out.write(file, await out.raster(draw(), size(), target.opaque));
  }
}

/** An Icon Composer bundle: each layer as Assets/<Name>.png, an icon.json unless one is kept, checked with ictool. */
async function writeAppleIcon(out: Output, bundle: string, layers: Record<string, string>, icon: Icon): Promise<void> {
  for (const [name, layerName] of Object.entries(layers)) {
    // The background fills the square; every other layer floats on transparent for the glass.
    out.write(path.join(bundle, 'Assets', `${name}.png`), await out.raster(visible(icon.layer(layerName)), 1024));
  }
  const json = path.join(bundle, 'icon.json');
  if (!fs.existsSync(json)) {
    const names = Object.keys(layers).filter(name => layers[name] !== 'background');
    out.write(json, JSON.stringify({
      groups: [{layers: [...names.map(name => ({'image-name': `${name}.png`, name})),
        ...Object.entries(layers).filter(([, layer]) => layer === 'background').map(([name]) => ({'image-name': `${name}.png`, name, glass: false}))],
        shadow: {kind: 'neutral', opacity: 0.3}, translucency: {enabled: true, value: 0.15}}],
      'supported-platforms': {squares: 'shared'},
    }, null, 2) + '\n');
  }
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/xcrun')) {
    const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-icon-'));
    try {
      execFileSync('/usr/bin/xcrun', ['ictool', bundle, '--compile', compiled, '--platform', 'iphoneos', '--minimum-deployment-target', '26.0'], {stdio: 'pipe'});
    } catch (error) {
      const failure = error as {stderr?: Buffer | string; message: string};
      throw new Error(`Xcode rejected ${out.rel(bundle)}: ${failure.stderr || failure.message}`);
    } finally {
      fs.rmSync(compiled, {recursive: true, force: true});
    }
  }
}

/** One way the icon is drawn: a shape and the scale of its mark. */
export interface PreviewShape {
  shape: Shape;
  scale: number;
}

/**
 * The drawings a job ships, in order, so its preview shows what is written: Android's rounded and circle icons,
 * then every file's shape at the scale it uses. Layer-only and Apple Icon Composer files are drawn elsewhere.
 */
export function previewShapes(job: IconJob): PreviewShape[] {
  const shapes: PreviewShape[] = [];
  const add = (shape: Shape, scale = 1): void => {
    if (!shapes.some(s => s.shape === shape && s.scale === scale)) shapes.push({shape, scale});
  };
  if (job.android) {
    add('rounded');
    if (job.android.round !== false) add('circle');
  }
  for (const target of job.files || []) {
    if (target.layer || target.path.endsWith('.icon') || target.shape === 'mark') continue;
    add(target.shape || 'rounded', target.scale || 1);
  }
  if (!shapes.length) for (const shape of ['square', 'rounded', 'circle'] as const) add(shape);
  return shapes;
}

/** icon-preview.png: each shape the job ships, and its mark, large; launcher sizes on light and dark; the themed icon. */
export async function writePreview(out: Output, icon: Icon, job: IconJob): Promise<void> {
  const img = (svg: string, size: number): string => `<img width="${size}" height="${size}" src="${dataUri(svg)}">`;
  const themed = icon.monochrome ? themedIcon(icon.monochrome) : null;
  const shapes = previewShapes(job);
  const [first] = shapes;
  // Android launchers mix rounded and circle masks; anything else is shown as it ships.
  const circle = shapes.find(s => s.shape === 'circle');
  const sizes: [number, PreviewShape][] = [[72, first], [48, job.android && circle ? circle : first], [32, first], [16, first]];
  const draw = ({shape, scale}: PreviewShape): string => icon.draw(shape, scale);
  const row = (bg: string): string => `<div style="background:${bg};border-radius:18px;padding:18px;display:flex;gap:18px;align-items:end">${sizes.map(([s, shape]) => img(draw(shape), s)).join('')}${themed ? img(themed, sizes[0][0]) : ''}</div>`;
  await out.page.setViewportSize({width: 1200, height: 600});
  await out.page.setContent(`<body style="margin:0;background:#fff;font:14px sans-serif">
      <main style="width:fit-content;padding:24px;display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;gap:24px;align-items:end">${shapes.map(shape => img(draw(shape), 180)).join('')}${img(icon.draw('mark', first.scale), 180)}</div>
        ${row('#ece6e2')}
        ${row('#1d1b20')}
      </main>
    </body>`);
  await out.page.waitForTimeout(200);
  out.write(path.join(icon.dir, 'icon-preview.png'), await out.page.locator('main').screenshot());
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
