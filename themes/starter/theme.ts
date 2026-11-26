// {{name}}: one soft field under the whole strip (shadcn's quiet --accent and --muted tints), laid out in panorama coordinates so it runs across every seam.
import type {Theme} from 'screenshot-studio';
import {panoramaGradient} from 'screenshot-studio/shapes';

export default {
  // The field runs across every card; the exporter checks that it does.
  continuous: true,

  art(ctx) {
    const {W, H} = ctx;
    return `<defs>${panoramaGradient(ctx, 'field', ['var(--accent)', 'var(--background)', 'var(--muted)'])}</defs><rect width="${W}" height="${H}" fill="url(#field)"/>`;
  },
} satisfies Theme;
