// A README name banner: `"identity": true` (or {icon, name}) on a card swaps its headline for the app icon, the
// app's name and an optional tagline (the card's `tagline` copy, with *highlight*). studio.json "identity" sets the
// defaults: icon (from store-listing/, default brand/icon.png) and name (default "app").
import {parseHighlight} from '../core/layout';
import type {Card, StudioConfig} from '../core/types';
import {appendRuns} from './text';

export async function identity(slide: Card, config: StudioConfig): Promise<HTMLElement> {
  const spec = {icon: 'brand/icon.png', name: config.app, ...config.identity, ...(typeof slide.identity === 'object' ? slide.identity : {})};
  const banner = document.createElement('div');
  banner.className = 'identity';
  banner.dataset.checkBounds = '';
  // No icon yet (a project made from screenshots): the banner is the name alone.
  if ((await fetch(`../${spec.icon}`, {method: 'HEAD'})).ok) banner.append(Object.assign(document.createElement('img'), {src: `../${spec.icon}`, alt: ''}));
  banner.append(Object.assign(document.createElement('span'), {textContent: spec.name ?? ''}));
  if (slide.tagline) {
    const small = document.createElement('small');
    appendRuns(small, parseHighlight(slide.tagline));
    banner.append(small);
  }
  return banner;
}
