// {{name}}: one soft field under the whole strip, laid out in panorama coordinates so it runs across every seam.
import {panoramaGradient} from './studio/shapes.js';

/** @type {import('./studio/types').Theme} */
export default {
  // The field runs across every card; the exporter checks that it does.
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    return `<defs>${panoramaGradient(ctx, 'field', ['#eef0ff', '#f6f6fb', '#eef7f3'])}</defs><rect width="${W}" height="${H}" fill="url(#field)"/>`;
  },
};
