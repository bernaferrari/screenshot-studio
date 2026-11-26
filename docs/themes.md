# Themes

`npx screenshot-studio init --theme <name>` copies a theme into `store-listing/` (`theme.css`, `theme.ts`, and its fonts into `assets/`).
From then on it is the app's own: edit it freely. `npx screenshot-studio themes` lists what ships.

| Theme | Look |
|---|---|
| `starter` | A soft neutral field, blue highlight. The smallest theme, for building your own. |
| `aurora` | A night sky lit by soft green, teal and violet lights, silver frames, bold rounded type (Google Sans Flex). |
| `porcelain` | A peach-to-lavender wash with glows and frosted tiles, deep type, a violet highlight, white frames (Plus Jakarta Sans). |
| `paper` | A warm ruled page with a running head, grotesque type, a pink highlighter (Schibsted Grotesk). |
| `panels` | A rounded, softly lit panel per card, each a turn of the primary's hue, on graph paper (Bricolage Grotesque). |
| `signal` | An electric field with a halftone screen swelling toward the foot, huge type, key words on a sharp highlighter (Archivo). |
| `mono` | Zinc near-black and white with one orange primary, graphite frames, nothing else; works light too (Geist). |

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
| `tilt` | Beside another word (`"big tilt"`): the device turned in perspective, set by `--tilt` |

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

`satisfies Theme` checks every hook and its `ctx`. For your editor to check it too, add the package as a dev
dependency (`npm i -D screenshot-studio`): it ships the types of `screenshot-studio` and `screenshot-studio/shapes`.
Write plain TypeScript: types are stripped, not compiled, so enums and namespaces aren't supported. A `theme.js` from an
older version still works; when both exist, `theme.ts` wins.

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

For words or art on one card only, use the card's `layers` ([Setting up an app](setup.md#cards)) and style their
classes here. `z-index: 1` sits over the background and under the devices (2) and headline (3). Keep anything
decorative away from the headline, and inside the card: a motif cut at a card's edge breaks the seam.

## 3D devices

A theme can draw its phones and tablets as real 3D devices (three.js, loaded only for those cards):

```js
export default {
  depth: true,        // or a list of galleries: ['phone', 'tablet7']
};
```

Each device keeps its frame's size, bezel and corners, and takes its pose from the frame's CSS `transform`, so a tilt is
plain CSS: the `tilt` layout word, `--tilt` for its angle, or any `perspective(…) rotateY(…)` of your own. The body is
white, or `--device-body` on `.device`. The flat frame stays in place, hidden, so bounds checks and callouts work as
before. A card opts out with the layout word `flat`. `npx screenshot-studio demo --3d` shows it.

## Fonts

Themes ship their fonts (Latin and Latin Extended, from Google Fonts) with each font's SIL Open Font License beside
it in `assets/`. Other scripts fall back to `var(--script-font)`, a matching system face.
