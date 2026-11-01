/** Android VectorDrawable XML as an SVG layer on the 108 canvas (paths, groups, clips, alphas and gradients). */
import fs from 'node:fs';
import path from 'node:path';
import {escapeAttribute, findElement, parseXml, type XmlElement} from './xml';

type Attributes = Record<string, string>;
/** An attribute value, escaped for the SVG. */
const esc = (value: string | undefined): string => escapeAttribute(String(value));
/** An SVG paint and its opacity. */
type Paint = [string, number];

/** `npx screenshot-studio icons --import drawable.xml > layer.svg` */
export function importVector(file: string): string {
  return vectorToSvg(fs.readFileSync(file, 'utf8'), path.basename(file));
}

/** A vector drawable's markup as an SVG document; `name` is the file it came from. */
export function vectorToSvg(xml: string, name: string): string {
  let document: XmlElement;
  try {
    document = parseXml(xml);
  } catch (error) {
    throw new Error(`${name} is not valid XML: ${error instanceof Error ? error.message : error}`);
  }
  const vector = findElement(document, 'vector');
  if (!vector) throw new Error(`${name} is not an Android vector drawable`);
  const root = android(vector);
  const defs: string[] = [];
  let ids = 0;

  /** A group's children. A clip applies to the rest of its group, so it stays open until the group ends. */
  const children = (elements: XmlElement[]): string => {
    let out = '', clips = 0;
    for (const element of elements) {
      const a = android(element);
      if (element.name === 'group') {
        out += `<g transform="${groupTransform(a)}">${children(element.children)}</g>`;
      } else if (element.name === 'clip-path') {
        const id = `clip${ids++}`;
        defs.push(`<clipPath id="${id}"><path d="${esc(a.pathData)}"/></clipPath>`);
        out += `<g clip-path="url(#${id})">`;
        clips++;
      } else if (element.name === 'path') {
        out += pathElement(element, a);
      } else {
        out += children(element.children);
      }
    }
    return out + '</g>'.repeat(clips);
  };

  const pathElement = (element: XmlElement, a: Attributes): string => {
    let fill = colour(a.fillColor, +(a.fillAlpha ?? 1)), stroke = colour(a.strokeColor, +(a.strokeAlpha ?? 1));
    // A gradient fill or stroke: <aapt:attr name="android:fillColor"><gradient …><item …/></gradient></aapt:attr>.
    for (const attr of element.children) {
      const target = attr.name === 'aapt:attr' && attr.attributes.name?.match(/^android:(fillColor|strokeColor)$/)?.[1];
      const gradient = attr.children[0];
      if (!target || !gradient) continue;
      const paint: Paint = [`url(#${gradientDef(gradient)})`, 1];
      if (target === 'fillColor') fill = paint; else stroke = paint;
    }
    const parts = [`d="${esc(a.pathData)}"`, `fill="${esc(fill[0])}"`];
    if (fill[1] !== 1) parts.push(`fill-opacity="${fill[1]}"`);
    if (a.fillType === 'evenOdd') parts.push('fill-rule="evenodd"');
    if (stroke[0] !== 'none' && +(a.strokeWidth ?? 0) > 0) {
      parts.push(`stroke="${esc(stroke[0])}"`, `stroke-width="${esc(a.strokeWidth)}"`);
      if (stroke[1] !== 1) parts.push(`stroke-opacity="${stroke[1]}"`);
      if (a.strokeLineCap) parts.push(`stroke-linecap="${esc(a.strokeLineCap)}"`);
      if (a.strokeLineJoin) parts.push(`stroke-linejoin="${esc(a.strokeLineJoin)}"`);
      if (a.strokeMiterLimit) parts.push(`stroke-miterlimit="${esc(a.strokeMiterLimit)}"`);
    }
    return `<path ${parts.join(' ')}/>`;
  };

  /** Adds a <gradient> to defs and returns its id. */
  const gradientDef = (gradient: XmlElement): string => {
    const g = android(gradient), id = `grad${ids++}`;
    const stops = gradient.children.filter(item => item.name === 'item').map(item => {
      const a = android(item), [c, o] = colour(a.color);
      return `<stop offset="${esc(a.offset)}" stop-color="${esc(c)}" stop-opacity="${o}"/>`;
    }).join('');
    defs.push(g.type === 'radial'
      ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${esc(g.centerX)}" cy="${esc(g.centerY)}" r="${esc(g.gradientRadius)}">${stops}</radialGradient>`
      : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${esc(g.startX)}" y1="${esc(g.startY)}" x2="${esc(g.endX)}" y2="${esc(g.endY)}">${stops}</linearGradient>`);
    return id;
  };

  const out = children(vector.children);
  const scale = `scale(${108 / parseFloat(root.viewportWidth)} ${108 / parseFloat(root.viewportHeight)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">\n  <!-- Imported from ${name}. -->\n  <defs>${defs.join('')}</defs>\n  <g transform="${scale}">${out}</g>\n</svg>\n`;
}

/** An element's attributes without the android: prefix. */
function android(element: XmlElement): Attributes {
  return Object.fromEntries(Object.entries(element.attributes).map(([name, value]) => [name.replace(/^android:/, ''), value]));
}

/** A group's pivot, translation, rotation and scale as an SVG transform. */
function groupTransform(a: Attributes): string {
  const px = +(a.pivotX || 0), py = +(a.pivotY || 0);
  return [`translate(${+(a.translateX || 0) + px} ${+(a.translateY || 0) + py})`, `rotate(${a.rotation || 0})`,
    `scale(${a.scaleX || 1} ${a.scaleY || 1})`, `translate(${-px} ${-py})`].map(esc).join(' ');
}

/** An Android colour (#rgb, #argb, #rrggbb or #aarrggbb) as an SVG colour and opacity, times `alpha`. */
function colour(value: string | undefined, alpha = 1): Paint {
  if (!value || value === '@android:color/transparent') return ['none', 1];
  let hex = value.replace('#', '');
  if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
  let a = 1;
  if (hex.length === 8) { a = parseInt(hex.slice(0, 2), 16) / 255; hex = hex.slice(2); }
  return [`#${hex}`, +(a * alpha).toFixed(3)];
}
