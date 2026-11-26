// What CSS sees of a card besides its elements: its words as data attributes, its layers, and SVG attributes that
// use CSS functions, moved where CSS applies them.
import {fillWords, parseHeadline} from '../core/layout';
import type {Layer} from '../core/types';
import {appendRuns} from './text';

/** SVG presentation attributes a theme may write with CSS values. */
const PRESENTATION = ['fill', 'stroke', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color', 'color',
  'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'mix-blend-mode', 'filter', 'transform'];
const CSS_VALUE = /\b(var|color-mix|calc|light-dark|oklch|oklab|lch|lab|hwb)\(/;

/**
 * SVG attributes can't read CSS variables or functions, but style can: move every presentation attribute that uses
 * one (stop-color="var(--primary)", fill="color-mix(…)") into the element's style, so themes write them either way.
 */
export function cssAttributes(root: Element) {
  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const name of PRESENTATION) {
      const value = element.getAttribute(name);
      if (value && CSS_VALUE.test(value)) {
        (element as SVGElement).style.setProperty(name, value);
        element.removeAttribute(name);
      }
    }
  }
}

/** The card's words as data-* attributes on <main>, for CSS's `content: attr(data-number)`. */
export function wordAttributes(main: HTMLElement, words: Record<string, string>) {
  for (const name of ['feature', 'number', 'cards', 'app', 'title', 'body', 'tagline'])
    if (words[name]) main.setAttribute(`data-${name}`, words[name]);
}

/** The card's layers, as elements: div.layer for text, an inline svg or img.layer for art. */
export async function addLayers(main: HTMLElement, layers: Layer[], words: Record<string, string>) {
  for (const layer of layers) {
    let element: HTMLElement | SVGElement;
    if (layer.src && /\.svg$/i.test(layer.src)) {
      const response = await fetch(`../${layer.src}`);
      if (!response.ok) throw new Error(`Cannot load layer ${layer.src}`);
      const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').querySelector('svg');
      if (!svg) throw new Error(`Layer ${layer.src} isn't an SVG`);
      element = document.importNode(svg, true);
      cssAttributes(element);
    } else if (layer.src) {
      const img = Object.assign(document.createElement('img'), {src: `../${layer.src}`, alt: ''});
      await img.decode().catch(() => { throw new Error(`Cannot load layer ${layer.src}`); });
      element = img;
    } else {
      element = document.createElement('div');
      for (const runs of parseHeadline(fillWords(layer.text || '', words).text)) {
        const line = document.createElement('span');
        line.className = 'line';
        appendRuns(line, runs);
        element.append(line);
      }
    }
    element.classList.add('layer', `layer-${layer.place || 'behind'}`, ...(layer.class || '').split(/\s+/).filter(Boolean));
    element.setAttribute('aria-hidden', 'true');
    for (const [name, value] of Object.entries(layer.style || {})) element.style.setProperty(name, value);
    main.append(element);
  }
}
