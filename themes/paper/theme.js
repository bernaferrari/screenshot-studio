// {{name}}: paper. A ruled page under the whole strip: the paper's tone is laid out in panorama coordinates and the
// rules sit at the same heights on every card, so the set reads as one page. Each card carries a running head with
// the app's name and its page number.
import {panoramaGradient} from './studio/shapes.js';

const styled = svg => svg.replace(/stop-color="([^"]+)"/g, 'style="stop-color:$1"');

/** @type {import('./studio/types').Theme} */
export default {
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    // College-ruled: one rule every line, starting below a top margin.
    const gap = Math.round(Math.min(W, H) / 15);
    let rules = '';
    for (let y = gap * 2; y < H; y += gap) rules += `<path d="M0 ${y}H${W}" style="stroke:var(--rule)" stroke-width="2"/>`;
    const paper = panoramaGradient(ctx, 'page', ['var(--paper)', 'color-mix(in oklab,var(--paper) 97%,var(--ink))', 'var(--paper)', 'color-mix(in oklab,var(--paper) 96%,var(--ink))']);
    return `<defs>${styled(paper)}</defs><rect width="${W}" height="${H}" fill="url(#page)"/>${rules}`;
  },

  compose({main, slide, slides, index, config}) {
    // The running head (Play strips only; README art stands alone).
    if (!slide.title || slides.length < 2) return;
    const folio = document.createElement('div');
    folio.className = 'folio';
    folio.dataset.checkBounds = '';
    const name = document.createElement('span');
    name.textContent = config.app || '';
    const page = document.createElement('span');
    page.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    folio.append(name, page);
    main.append(folio);
  },
};
