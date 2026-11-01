// {{name}}: signal. One bold field lit from the top, and a deeper block across the lower part of the whole strip,
// level on every card so every seam meets. The highlighter is drawn here from --accent: a full-height stroke with
// slightly uneven ends, like a real pen.

const marker = color => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='M1.2 6 L98.6 2 L100 48 L98.8 97 L0.6 99 L0 52 Z' fill='${color}'/></svg>`)}")`;

/** @type {import('./studio/types').Theme} */
export default {
  continuous: true,

  art({W, H}) {
    // The block's top edge: just under the copy on portrait cards, under the tablet's middle on landscape ones.
    const y = Math.round(H * (W > H ? .62 : .36));
    return `<defs>
      <radialGradient id="top" cx=".5" cy="-.15" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient></defs>
      <rect width="${W}" height="${H}" style="fill:var(--paper)"/><rect width="${W}" height="${H}" fill="url(#top)"/>
      <rect y="${y}" width="${W}" height="${H - y}" style="fill:var(--block)"/><rect y="${y}" width="${W}" height="${H - y}" fill="url(#foot)"/>`;
  },

  compose({main, slide}) {
    const accent = getComputedStyle(main).getPropertyValue('--accent').trim() || '#ffe58f';
    main.style.setProperty('--marker', marker(slide.marker || accent));
  },
};
