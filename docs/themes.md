# Themes

`npx screenshot-studio init --theme <name>` copies a theme into `store-listing/` (`theme.css`, `theme.js`, and its fonts into `assets/`).
From then on it is the app's own: edit it freely. `npx screenshot-studio themes` lists what ships.

| Theme | Look |
|---|---|
| `starter` | A plain light field. The smallest theme, for building your own. |
| `aurora` | A dark field lit by soft lights in the accent, warm porcelain frames, bold rounded type (Google Sans Flex). |
| `porcelain` | A peach-to-sky wash with glows and frosted tiles, navy type, one highlight color, white frames (Plus Jakarta Sans). |
| `paper` | A warm ruled page with a running head, grotesque type, a highlighter (Schibsted Grotesk). |
| `panels` | A rounded, softly lit panel per card, each a turn of the accent's hue, on graph paper (Bricolage Grotesque). |
| `signal` | A bold field over a deeper block, huge type, key words on a highlighter (Archivo). |
| `mono` | Near-black and white with one accent, graphite frames, nothing else; works light too (Geist). |

Each theme but `starter` has a `preview.jpg` of its phone strip.

## Re-branding

Every theme starts with three CSS variables, and mixes everything else from them:

```css
:root{
  --paper:#190a11;   /* the background */
  --ink:#fff6f3;     /* the type */
  --accent:#ff8a7a;  /* the highlight, and whatever the theme builds from it */
}
```

Change those three and the lights, washes, panels, rules and frames follow. The derived colors (`--muted`,
`--light-1`, `--warm`, `--block`…) are listed right under them; set any of them to take it over.

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
gallery (`.phone`, `.tablet7`…), where the derived ones are worked out. A theme can be CSS alone; `theme.js` is
optional.

`hang` cards may leave the top edge and the feature graphic's phone may show only its top; the renderer knows both,
so no `bounds` setting is needed.

## Tailwind

A theme can use Tailwind CSS: add `@import "tailwindcss";` to `theme.css`. The studio compiles it when the card
renders, so there is nothing to install or build. Then:

- **Layers take utility classes**, so one card gets a sticker or background words without new CSS:
  `{"text": "*{kicker}*", "class": "-rotate-6 rounded-full bg-primary px-8 py-3 text-5xl font-bold text-primary-foreground", "place": "front", "style": {"left": "620px", "top": "560px"}}`
- **Colors are shadcn/ui's tokens**, worked out from the theme's three variables: `background` and `foreground`
  (`--paper`, `--ink`), `primary` and `primary-foreground` (the brand `--accent` and text on it), `muted-foreground`,
  `secondary`, `card`, `border`, `ring`, and, as in shadcn, `accent` and `muted` as quiet tints. Re-branding the three
  variables re-colors every utility; `paper` and `ink` work too. To use a shadcn palette instead, paste its variables
  into `:root` (`--background`, `--primary`, `--primary-foreground`…) and each token takes them, except `--accent` and
  `--muted`, which keep the studio's meaning (the brand color, muted text): leave those two out.
- **`@apply` works in the theme's own rules**: `h1 em{@apply text-primary}`.

Tailwind's reset (preflight) is left out, so it can't undo the renderer's base styles. Utilities apply to the
elements a theme or card names (layers, layout words, device roles, and class names in `theme.js`); the headline,
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

Draw backgrounds in `theme.js`'s `art()` with the helpers in `studio/shapes.js` (`panoramaLights`, `panoramaGradient`,
the shapes): they lay art out across the strip so seams continue. `art()` may write CSS in attributes
(`fill="var(--accent)"`, `stop-color="color-mix(…)"`); the renderer moves them into `style`, where CSS applies. A
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
