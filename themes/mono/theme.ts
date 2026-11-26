// {{name}}: mono. A flat field, one soft light in the primary behind each card's device (laid out in panorama
// coordinates, so each light spills across the seams into its neighbours) and a hairline horizon.
import type {Theme} from 'screenshot-studio';
import {panoramaLights, type Light} from 'screenshot-studio/shapes';

export default {
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    const landscape = W > H;
    const light: Light = {x: landscape ? .66 : .5, y: landscape ? .55 : .62, r: .5, color: 'var(--glow)', stops: [[0, .9], [.6, .25], [1, 0]]};
    const y = Math.round(H * (landscape ? .5 : .46));
    return `<rect width="${W}" height="${H}" style="fill:var(--background)"/>` + panoramaLights(ctx, [light], {id: 'glow'}) +
      `<rect y="${y}" width="${W}" height="2" style="fill:var(--border)"/>`;
  },
} satisfies Theme;
