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

## Fonts

Themes ship their fonts (Latin and Latin Extended, from Google Fonts) with each font's SIL Open Font License beside
it in `assets/`. Other scripts fall back to `var(--script-font)`, a matching system face.
