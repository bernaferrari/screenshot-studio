# Themes

`npx screenshot-studio init --theme <name>` copies a theme into `store-listing/` (`theme.css`, `theme.ts`, and its fonts into `assets/`).
From then on it is the app's own: edit it freely. `npx screenshot-studio themes` lists what ships.

| Theme | Look |
|---|---|
| `starter` | A soft neutral field, blue highlight. The smallest theme, for building your own. |
| `aurora` | A real aurora, drawn by a shader: curtains of fine rays, green at the hem into a violet fringe, stars, dark glass frames, bold rounded type (Google Sans Flex). |
| `porcelain` | A peach-to-lavender wash with glows and frosted tiles, deep type, a violet highlight, white frames (Plus Jakarta Sans). |
| `paper` | A warm ruled page with a running head, grotesque type, a pink highlighter (Schibsted Grotesk). |
| `panels` | A rounded, softly lit panel per card, each a turn of the primary's hue, on graph paper (Bricolage Grotesque). |
| `signal` | An electric field with a halftone screen swelling toward the foot, huge type, key words on a sharp highlighter (Archivo). |
| `mono` | Black and white only: a soft light through a panel of fluted glass, drawn by a shader, silver emphasis, graphite frames (Geist). |

Each theme but `starter` has a `preview.jpg` of its phone strip.

## Re-branding

Colors are [shadcn/ui](https://ui.shadcn.com/docs/theming)'s tokens. Every theme sets three, and mixes the rest from
them:

```css
:root{
  --background:oklch(0.17 0.045 268);  /* the field */
  --foreground:oklch(0.97 0.01 250);   /* the type */
  --primary:oklch(0.85 0.17 162);      /* the highlight, and whatever the theme builds from it */
}
```

Change those three and the lights, washes, panels, rules and frames follow. A palette from
[ui.shadcn.com/themes](https://ui.shadcn.com/themes) can be pasted in as it is. Every token a theme leaves out has a
default mixed from the three: `--muted-foreground` (supporting lines), `--border` (hairlines, rules, graph paper),
`--card` (frames), `--accent` and `--muted` (quiet tints of the primary and the type), `--primary-foreground` (text on
the primary). A theme's own derived colors (`--light-1`, `--warm`, `--background-deep`…) are listed right under the
three; set any of them to take it over.

## Layouts

Every theme styles these layout words on the phone, 7-inch and 10-inch galleries:

| Layout | Devices |
|---|---|
| `big` | One device, large, under the copy (on the 10-inch: copy left, tablet right) |
| `hang` | The phone hangs from the top edge, the copy below it (on the 10-inch the tablet stays whole, top right) |
| `duo` | Two devices, roles `primary` and `secondary`, the second stepping in front |
| `tilt` | Beside another word (`"big tilt"`): the device turned in perspective (`--tilt`), drawn in 3D |
| `3d`, `flat` | A real 3D device standing straight; or the flat frame, whatever else says (see 3D devices) |

They come from `studio/layouts.css`, which a theme opts into with its first rule, and places with a few variables per
gallery, so a new gallery size gets all three layouts without new CSS:

```css
@import "studio/layouts.css";
.phone{--inset:84px;--copy-top:150px;--device-left:84px;--device-top:610px;--hang-top:-760px;--duo-width:560px;--duo-step:180px}
```

| Variable | What it places |
|---|---|
| `--inset`, `--inset-end` | The copy's side margins (landscape: its left edge, with `--copy-width`) |
| `--copy-top`, `--copy-bottom` | Where the copy starts, and where it ends on `hang` cards |
| `--device-left`, `--device-right`, `--device-top` | The `big` device (its width is what's left between them); `hang` uses `--hang-top` |
| `--duo-left`, `--duo-right`, `--duo-width`, `--duo-second-width`, `--duo-top`, `--duo-step` | `duo`: the primary from the left, the secondary from the right and `--duo-step` lower |

Every variable has a default worked out from the canvas, portrait or landscape. The layouts sit in a cascade layer,
so any rule in `theme.css` wins over them: place one card by hand with an ordinary selector. Set the variables on the
gallery (`.phone`, `.tablet7`…), where the derived ones are worked out. A theme can be CSS alone; `theme.ts` is
optional.

`hang` cards may leave the top edge and the feature graphic's phone may show only its top; the renderer knows both,
so no `bounds` setting is needed.

## TypeScript

`theme.ts` and `capture.tour.ts` are TypeScript. The studio strips the types when it serves the theme (and Node runs
the tour as it is), so there is nothing to build:

```ts
import type {Theme} from 'screenshot-studio';
import {panoramaLights} from 'screenshot-studio/shapes';

export default {
  continuous: true,
  art: ctx => panoramaLights(ctx, [{x: .5, y: .3, r: .6, color: 'var(--primary)', opacity: .4}]),
} satisfies Theme;
```

`satisfies Theme` checks every hook and its `ctx`. A theme that reads card fields of its own from `gallery.json` (a
`"glyph": "∑"` on a card, say) names them, `satisfies Theme<{glyph?: string}>`, so `ctx.slide.glyph` is typed and
anyone reading the theme sees which fields it takes. For your editor to check it too, add the package as a dev
dependency (`npm i -D screenshot-studio`): it ships the types of `screenshot-studio` and `screenshot-studio/shapes`.
Write plain TypeScript: types are stripped, not compiled, so enums and namespaces aren't supported. The studio reads
`theme.ts` only; `check` names a `theme.js` from an older version, to rename.

## Shaders

A theme can paint its background with a GLSL shader, under its art: `shader` in `theme.ts`. Write one function,
`vec4 shade(vec2 p)`: `p` is the pixel's place on the whole strip in CSS pixels (x along the strip, y down), so the
background continues across every seam by itself. The studio draws it once per card (WebGL2, no library) and dithers
it, so gradients don't band in a JPEG.

```ts
import type {Theme} from 'screenshot-studio';

export default {
  continuous: true,
  shader: {
    source: `vec4 shade(vec2 p) {
      float glow = fbm(p / 400.) * (1. - .8 * copyShade(p, 160.));  // no light behind the words
      return vec4(mixOklab(u_background, u_glow, glow), 1.);
    }`,
    uniforms: {u_glow: 'var(--primary)'},
  },
} satisfies Theme;
```

| It gets | |
|---|---|
| `u_size`, `u_offset`, `u_strip` | this card's size, where it starts on the strip, and the whole strip's size (CSS px) |
| `u_index`, `u_cards`, `u_scale` | this card's position, how many cards, device pixels per CSS pixel |
| `u_background`, `u_foreground`, `u_primary` | the theme's three colors, sRGB 0–1 |
| `u_copy` | the words' box on this card (x, y, width, height); `copyShade(p, reach)` is 1 behind them, fading out, and 0 at the card's sides |
| `hash`, `noise`, `fbm`, `bayer` | noise and an 8 × 8 ordered dither threshold (`step(bayer(p), v)` turns a value into dots) |
| `mixOklab`, `toOklab`, `fromOklab` | mixing colors through oklab, so the way between them stays clean |

`uniforms` adds your own: a number, an array (a vector) or a CSS color (`'var(--accent)'` becomes a `vec3`). Make
`shader` a function, `ctx => ({source, uniforms})`, to choose per card or size (mono's flutes follow the card width).
A compile error names the line in your code. `aurora` and `mono` are shaders to read.

## Tailwind

A theme can use Tailwind CSS: add `@import "tailwindcss";` to `theme.css`. The studio compiles it when the card
renders, so there is nothing to install or build. Then:

- **Layers take utility classes**, so one card gets a sticker or background words without new CSS:
  `{"text": "*{kicker}*", "class": "-rotate-6 rounded-full bg-primary px-8 py-3 text-5xl font-bold text-primary-foreground", "place": "front", "style": {"left": "620px", "top": "560px"}}`
- **Colors are the theme's shadcn/ui tokens**: `bg-background`, `text-foreground`, `bg-primary
  text-primary-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, and, as in shadcn, `bg-accent` and
  `bg-muted` for quiet tints. Re-branding the three tokens re-colors every utility.
- **`@apply` works in the theme's own rules**: `h1 em{@apply text-primary}`.

Tailwind's reset (preflight) is left out, so it can't undo the renderer's base styles. Utilities apply to the
elements a theme or card names (layers, layout words, device roles, and class names in `theme.ts`); the headline,
frames and labels are built by the renderer and are styled by `theme.css` rules as before.

## What CSS can see

The renderer tells `theme.css` where each card is and what it says, so a theme's rules can use them:

| On | What | For |
|---|---|---|
| `:root` | `--card-index`, `--cards` | The card's place in its gallery (0-based) and how many there are |
| `:root` | `--card-x`, `--strip-width` | The card's left edge in the strip, and the strip's width, in px |
| `:root` | `--canvas-width`, `--canvas-height` | The card's size |
| `main` | `data-number`, `data-cards` | `"02"`, `"06"`, for `content: attr(data-number)` |
| `main` | `data-title`, `data-body`, `data-tagline`, `data-feature`, `data-app` | The card's words in this language (the title without markup) |

Draw backgrounds in `theme.ts`'s `art()` with the helpers in `screenshot-studio/shapes` (`panoramaLights`, `panoramaGradient`,
the shapes): they lay art out across the strip so seams continue. `art()` may write CSS in attributes
(`fill="var(--primary)"`, `stop-color="color-mix(…)"`); the renderer moves them into `style`, where CSS applies. A
CSS-only theme that draws across seams says so with `--continuous: 1`, so the exporter checks them.

Words a theme places itself (a panel's title from a device's own field, say) take the copy's markup with `markup(text)`
from the same module: `*highlight*`, `~struck~`, `[inserted]` and new lines, as em, del, ins and one `.line` per line.

For words or art on one card only, use the card's `layers` ([Setting up an app](setup.md#cards)) and style their
classes here. `z-index: 1` sits over the background and under the devices (2) and headline (3). Keep anything
decorative away from the headline, and inside the card: a motif cut at a card's edge breaks the seam.

## 3D devices

Phones and tablets can be real 3D devices, built like the real thing: an iPhone Pro's thickness (8.75 mm on 71.9 mm),
black glass around the capture on the screen, a metal band around the sides and a soft shadow on the card (three.js,
loaded only for the cards that have one). It's one CSS variable on the frame, `--depth`: the device's
thickness as a multiple of the real one's. `0`, the default, is the flat frame.

| To | Write |
|---|---|
| Tilt one card's phone, in 3D | `"layout": "big tilt"` in gallery.json (`--tilt` changes the pose) |
| Stand one card's phone up straight, in 3D | `"layout": "big 3d"` |
| Make every device 3D | `.device{--depth:1}` in theme.css |
| Only one gallery, or one device | `.phone .device{--depth:1}`, or by its role: `.device.hero{--depth:1}` |
| A chunkier device | `--depth:2` |
| Keep a card's, or one device's, flat frame | the layout word `flat`, or `flat` in the device's role (wins over everything) |

The device takes its pose from its frame's CSS `transform`, so any `perspective(…) rotateY(…)` of your own works too,
and the color of its metal band from `--device-body` (silver by default). The flat frame stays in place, hidden, so layout, bounds
checks and callouts work as before; in a theme, `ctx.devices[i].canvas` is the 3D drawing (to clip it at a panel's
edge in `decorate`, say). `npx screenshot-studio demo --3d` shows it.

## Fonts

Themes ship their fonts (Latin and Latin Extended, from Google Fonts) with each font's SIL Open Font License beside
it in `assets/`. Other scripts fall back to `var(--script-font)`, a matching system face.
