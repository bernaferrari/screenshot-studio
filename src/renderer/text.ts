// Headlines, taglines and labels as elements, from the markup the copy uses.
import {parseHeadline, type Run} from '../core/layout';
import type {Card} from '../core/types';

/** Append runs to an element: plain text, or an em / del / ins around it. */
export function appendRuns(parent: HTMLElement, runs: Run[]) {
  for (const run of runs) parent.append(run.tag ? Object.assign(document.createElement(run.tag), {textContent: run.text}) : run.text);
}

/** The card's header: its title, one span.line per line, and its body; null when it has no title. */
export function headline(slide: Card): HTMLElement | null {
  if (!slide.title) return null;
  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  for (const runs of parseHeadline(slide.title)) {
    const line = document.createElement('span');
    line.className = 'line';
    appendRuns(line, runs);
    h1.append(line);
  }
  header.append(h1);
  if (slide.body) header.append(Object.assign(document.createElement('p'), {textContent: slide.body}));
  return header;
}
