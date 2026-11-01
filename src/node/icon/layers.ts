/** The SVG layers an icon is drawn from, in store-listing/brand/ or a variant folder inside it. */
import fs from 'node:fs';
import path from 'node:path';
import {attributes} from './xml';

const MIME: Record<string, string> = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'};

/** <dir>/<name>.svg, or brand/<name>.svg when a variant folder (an alpha build's icon, say) doesn't redraw it. */
export function layerFile(brand: string, dir: string, name: string): string {
  const file = path.join(dir, `${name}.svg`);
  return fs.existsSync(file) || dir === brand ? file : path.join(brand, `${name}.svg`);
}

/** A layer's inner markup, ids prefixed with its name so layers can share one document, bitmap art inlined.
 *  rel shows a path in errors. */
export function readLayer(file: string, name: string, rel: (file: string) => string): string {
  const text = fs.readFileSync(file, 'utf8');
  const open = text.match(/<svg\b[^>]*>/);
  if (!open || attributes(open[0]).viewBox !== '0 0 108 108') throw new Error(`${rel(file)} must be an <svg viewBox="0 0 108 108">`);
  const inner = text.slice(open.index! + open[0].length, text.lastIndexOf('</svg>'));
  return inlineArt(scopeIds(inner, name.replace(/[^a-z0-9]/gi, '')), file, rel);
}

/** Prefix every id and every reference to one. */
function scopeIds(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/(xlink:)?href="#([^"]+)"/g, `href="#${prefix}-$2"`);
}

/** Replace each <image href="art.png"> beside the layer with a data URI. */
function inlineArt(markup: string, file: string, rel: (file: string) => string): string {
  const folder = path.dirname(file);
  return markup.replace(/(xlink:)?href="(?!#|data:|https?:)([^"]+)"/g, (_: string, __: string | undefined, art: string) => {
    const source = path.join(folder, art);
    if (!fs.existsSync(source)) throw new Error(`${rel(file)} embeds ${art}, which is not in ${rel(folder) || '.'}`);
    return `href="data:${MIME[path.extname(art).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(source).toString('base64')}"`;
  });
}
