// {{name}}: aurora. A night sky lit by soft lights in the primary color and its neighbours, laid out in panorama
// coordinates so every seam continues. Colors come from theme.css (--background, --primary and the --light-* mixed
// from it), so re-branding is three shadcn/ui tokens.
import type {Theme} from 'screenshot-studio';
import {panoramaGradient, panoramaLights} from 'screenshot-studio/shapes';

// x in card widths (repeated on every card), y as a fraction of the height, r as a fraction of the longer side.
const LIGHTS = [
  {x: .15, y: .95, r: .55, color: 'var(--light-1)', opacity: .42},
  {x: .85, y: .2, r: .5, color: 'var(--light-2)', opacity: .38},
  {x: .55, y: .7, r: .45, color: 'var(--light-3)', opacity: .22},
  {x: .95, y: .92, r: .32, color: 'var(--light-1)', opacity: .3},
  {x: .05, y: .1, r: .4, color: 'var(--light-4)', opacity: .5},
];

export default {
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    // The sky: the background, a touch lit by the primary in turns along the strip.
    const field = panoramaGradient(ctx, 'field', ['var(--background)', 'color-mix(in oklab,var(--background) 92%,var(--primary))', 'var(--background)', 'color-mix(in oklab,var(--background) 90%,var(--primary))']);
    return `<defs>${field}</defs><rect width="${W}" height="${H}" fill="url(#field)"/>` +
      panoramaLights(ctx, LIGHTS, {id: 'aurora', alone: ctx.kind === 'readme'});
  },
} satisfies Theme;
