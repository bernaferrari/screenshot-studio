// Auto-fit: longer languages shrink the copy (never below studio.json "minFit", 0.72 by default) until every headline
// line fits its column and the text clears the app views beside or below it. Then short last lines are reported.
import {isWidow} from '../core/layout';
import type {CardReport} from '../core/types';

/** The box around the header's text itself, not its element. */
function textBox(header: HTMLElement) {
  const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let node; (node = walker.nextNode());) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) { l = Math.min(l, rect.left); t = Math.min(t, rect.top); r = Math.max(r, rect.right); b = Math.max(b, rect.bottom); }
  }
  return {l, t, r, b};
}

/** Shrink the header's type in 2% steps until it fits; report.fit is the scale it settled on, 0 when nothing fits. */
export async function fitCopy(main: HTMLElement, header: HTMLElement, size: {W: number; H: number}, minFit: number, report: CardReport, refit?: () => unknown) {
  const blocks = [...main.querySelectorAll('.device:not(.device-frame-none)')].map(n => n.getBoundingClientRect());
  const fits = () => {
    if ([...header.querySelectorAll<HTMLElement>('h1 .line')].some(line => line.scrollWidth > line.parentElement!.clientWidth + 1)) return false;
    const t = textBox(header);
    if (t.l < -.5 || t.t < -.5 || t.r > size.W + .5 || t.b > size.H + .5) return false;
    return blocks.every(d => t.b + 16 <= d.top || t.t >= d.bottom || t.r + 16 <= d.left || t.l >= d.right);
  };
  const sizes = [...header.querySelectorAll<HTMLElement>('h1, p')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)] as const);
  for (let s = 1; !fits() && s > minFit - .001; s -= .02) {
    report.fit = Math.round(s * 100) / 100;
    for (const [el, px] of sizes) el.style.fontSize = `${px * s}px`;
    await refit?.();
  }
  if (!fits()) report.fit = 0;
}

/** The last two words of each headline line or body whose last wrapped line is too short. */
export function findWidows(header: HTMLElement): string[] {
  const widows: string[] = [];
  for (const el of header.querySelectorAll<HTMLElement>('h1 .line, p')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Map<number, {left: number; right: number}>();
    for (const rect of range.getClientRects()) {
      if (!rect.width) continue;
      const top = Math.round(rect.top / 4), line = lines.get(top);
      lines.set(top, line ? {left: Math.min(line.left, rect.left), right: Math.max(line.right, rect.right)} : {left: rect.left, right: rect.right});
    }
    if (isWidow([...lines.entries()].sort(([a], [b]) => a - b).map(([, l]) => l.right - l.left)))
      widows.push(el.textContent!.trim().split(/\s+/).slice(-2).join(' '));
  }
  return widows;
}
