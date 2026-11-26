// {{name}}: signal. One electric field under the whole strip, lit from the top and deepening toward the foot, and a
// halftone screen over its lower part: dots on one grid across the whole strip, swelling from nothing under the copy
// toward the foot, their size and strength shaded by a soft wave field over the strip, so every seam meets. The
// highlighter is drawn here from --primary: a full-height stroke with sharp, slightly uneven ends, like a real pen.
import type {Theme} from 'screenshot-studio';

const marker = (color: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='M1.2 6 L98.6 2 L100 48 L98.8 97 L0.6 99 L0 52 Z' fill='${color}'/></svg>`)}")`;

export default {
  continuous: true,

  art({W, H, index}) {
    const u = Math.min(W, H), landscape = W > H;
    // The screen: a dot every `step`, on a grid that runs on from the card before, so the dots line up at the seams.
    const step = u / 30, shift = (step - (index * W) % step) % step;
    // Dots start under the copy and grow toward the foot.
    const from = H * (landscape ? .42 : .32);
    // A soft wave field over the whole strip, like a shader: two slow interfering waves and a diagonal swell, in
    // strip coordinates (X runs on from card to card), so the screen breathes in bands that continue across seams.
    const field = (X: number, y: number) => {
      const a = Math.sin(X / u * 2.1 + Math.sin(y / u * 1.7) * 1.3);
      const b = Math.sin((X * .6 - y) / u * 2.6 + 1.2);
      const c = Math.sin((X + y * .8) / u * .9);
      return Math.min(1, Math.max(0, .5 + .3 * a + .22 * b + .18 * c));
    };
    let dots = '';
    for (let y = step / 2; y < H; y += step) {
      const t = Math.min(1, Math.max(0, (y - from) / (H - from)));
      if (t <= 0) continue;
      for (let x = shift - step; x < W + step; x += step) {
        const f = field(index * W + x, y), r = step * .5 * t ** 1.1 * (.25 + .75 * f);
        if (r < .6) continue;
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill-opacity="${(.25 + .5 * f).toFixed(2)}"/>`;
      }
    }
    return `<defs>
      <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--background)"/><stop offset="1" stop-color="var(--background-deep)"/></linearGradient>
      <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${-H * .1}" r="${Math.max(W, H) * .75}"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#field)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
      <g fill="var(--background)">${dots}</g>`;
  },

  compose({main, slide}) {
    const primary = getComputedStyle(main).getPropertyValue('--primary').trim() || '#fde68a';
    main.style.setProperty('--marker', marker(String(slide.marker || primary)));
  },
} satisfies Theme;
