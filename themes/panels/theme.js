// {{name}}: panels. Faint graph paper under the whole strip (in panorama coordinates, so the paper between the panels
// joins at every seam), and on each card a rounded panel in its own turn of the accent's hue, with a white wave
// across it and the devices cut at its edge.

// Hue turns, in degrees from the accent, card by card: far apart neighbours, then the turns in between.
const TURNS = [0, 180, 90, -60, 50, 220, 130, -110];

/** @type {import('./studio/types').Theme} */
export default {
  continuous: true,

  art({W, H, index}) {
    const cell = Math.round(Math.min(W, H) / 18), major = cell * 5;
    const off = (((-index * W) % major) + major) % major;
    const grid = (id, size, width, color) => `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" x="${off % size}">` +
      `<path d="M${size} 0V${size}H0" fill="none" style="stroke:var(${color})" stroke-width="${width}"/></pattern>`;
    return `<defs>${grid('minor', cell, 1.5, '--grid')}${grid('major', major, 2, '--grid-major')}</defs>` +
      `<rect width="${W}" height="${H}" style="fill:var(--paper)"/><rect width="${W}" height="${H}" fill="url(#minor)"/><rect width="${W}" height="${H}" fill="url(#major)"/>`;
  },

  compose({main, slide, index, W, H}) {
    // A card may pick its own turn with "turn" in gallery.json.
    main.style.setProperty('--turn', String(slide.turn ?? TURNS[index % TURNS.length]));
    const panel = document.createElement('section');
    panel.className = 'panel';
    const w = W - 72, h = H - 72, y = h * (W > H ? .62 : .5);
    panel.innerHTML = `<svg class="wave" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">` +
      `<path d="M0 ${y} C${w * .25} ${y - h * .12} ${w * .45} ${y - h * .1} ${w * .6} ${y + h * .02} S${w * .88} ${y + h * .1} ${w} ${y - h * .04} V${h} H0 Z"/></svg>`;
    // The devices live in the panel, so its rounded edge cuts them.
    for (const device of main.querySelectorAll('.device')) panel.append(device);
    main.querySelector('.art').after(panel);
  },
};
