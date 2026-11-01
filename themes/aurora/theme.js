// {{name}}: aurora. A dark field lit by soft lights in the accent's colors, laid out in panorama coordinates so
// every seam continues. Colors come from theme.css (--paper, --accent and the --light-* mixed from it), so
// re-branding is three CSS variables.
import {panoramaGradient, panoramaLights} from './studio/shapes.js';

// x in card widths (repeated on every card), y as a fraction of the height, r as a fraction of the longer side.
const LIGHTS = [
  {x: .15, y: .95, r: .55, color: 'var(--light-1)', opacity: .42},
  {x: .85, y: .2, r: .5, color: 'var(--light-2)', opacity: .38},
  {x: .55, y: .7, r: .45, color: 'var(--light-3)', opacity: .22},
  {x: .95, y: .92, r: .32, color: 'var(--light-1)', opacity: .3},
  {x: .05, y: .1, r: .4, color: 'var(--light-4)', opacity: .5},
];

// SVG attributes can't read CSS variables, but style properties can: move each stop's color into its style.
const styled = svg => svg.replace(/stop-color="([^"]+)"/g, 'style="stop-color:$1"');

/** @type {import('./studio/types').Theme} */
export default {
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    // The field: the paper, a touch lighter and darker in turns along the strip.
    const field = panoramaGradient(ctx, 'field', ['var(--paper)', 'color-mix(in oklab,var(--paper) 92%,var(--accent))', 'var(--paper)', 'color-mix(in oklab,var(--paper) 90%,var(--accent))']);
    return styled(`<defs>${field}</defs><rect width="${W}" height="${H}" fill="url(#field)"/>`) +
      styled(panoramaLights(ctx, LIGHTS, {id: 'aurora', alone: ctx.kind === 'readme'}));
  },

  compose({main, slide}) {
    // A headline-less card (README art under its own heading) has no copy.
    const header = main.querySelector('header');
    if (header && !header.querySelector('h1')?.textContent.trim()) header.remove();
    // hang: the device hangs from the top edge by design.
    if (/\bhang\b/.test(slide.layout || '')) slide.bounds = {top: true, ...slide.bounds};
  },
};
