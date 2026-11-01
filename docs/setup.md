# Setting up an app

Everything an app needs lives in its `store-listing/` folder. `init.cjs` creates a working starter; this page explains each file.

```
store-listing/
  studio/              the studio itself, copied in by sync.sh (never edit it here)
  studio.json          the app's settings: name, languages, capture, frames, bounds
  profiles.json        one entry per gallery: canvas size, capture size, device frame
  gallery.json         the cards: which capture, which layout, in which order
  theme.css            the look: type, colors, where devices sit
  theme.js             optional code: background art and extra elements
  capture-emulator.py  the scene tour (see Capturing)
  <locale>/copy.json   the words for each card
  <locale>/raw/        captures, each with a .nodes.json layout map
  brand/               the app icon's layers (see App icons)
```

## studio.json

```json
{
  "app": "SDK Monitor",
  "locales": ["en-US", "de-DE"],
  "defaultLocale": "en-US",
  "supersample": 2
}
```

`supersample: 2` renders at twice the size and scales down, which keeps rotated or scaled UI crisp. The other keys are optional and documented where they apply: `capture` ([Capturing](capture.md)), `frames` and `bounds` (below), `fastlane`, `minFit` and `readmeStrips` ([Languages and export](languages-and-export.md)), `identity` (README layouts, below).

## profiles.json

One entry per gallery (phone, 7-inch, 10-inch, README, a feature graphic…):

| Key | Meaning |
|---|---|
| `width`, `height` | The exported image |
| `captureWidth`, `captureHeight`, `captureDensity` | The emulator display for this gallery's captures |
| `frame` | `phone`, `iphone`, `tablet`, `browser` or `none` |
| `platform`, `simulator` | `"ios"` and the simulator its captures come from ([Capturing](capture.md#ios)) |
| `label` | The name shown in the editor |
| `defaultLocaleOnly` | Render once, in the default language (README art) |

## Cards

`gallery.json` lists each gallery's cards:

```json
{"phone": [
  {"feature": "apps", "layout": "gate-right", "raw": "phone/01-apps.png"},
  {"feature": "dark", "layout": "duo", "devices": [
    {"raw": "phone/11-apps-dark.png", "role": "primary"},
    {"raw": "phone/12-details-dark.png", "role": "secondary"}]}
]}
```

| Key | Meaning |
|---|---|
| `feature` | The card's name; its words are `copy.json[feature]` |
| `layout` | Words that become CSS classes on the card; the theme styles them |
| `raw` | One capture, from `<locale>/raw/` |
| `devices` | Several captures, each with a `role` (also a class), optional `frame` and `label` |
| `callouts` | Regions of the capture lifted out and magnified (below) |
| `file` | Output name; `.png` writes a PNG, with `"transparent": true` for 32-bit |
| `vars` | CSS custom properties for this card |

A card with no capture is art only (a drawn feature graphic, say). `"frame": "none"` shows a capture as the whole image. Any other key reaches the theme as `ctx.slide`.

**Tablets can inherit.** `{"inherits": "phone", "cards": [...]}` merges each card over the phone card at the same position, so a tablet gallery swaps captures and layout but keeps the phone's words.

**Headline markup.** In copy, `*highlight*` becomes `<em>`, `~old~` `<del>`, `[new]` `<ins>`, and `\n` breaks the line. The theme decides how each looks.

**Callouts** lift a region of the real screen out of the capture, magnified, centred where it lives:

```json
{"x": 163, "y": 908, "w": 880, "h": 176, "mag": 1.16, "radius": 24}
```

Coordinates are capture pixels; `dx`/`dy` move it. A callout may come from another capture of the same scene (`"raw"`, a notification shade, say) placed with `"place": {"left", "top", "width"}` in canvas pixels. `"role"` adds a class. The editor's callout picker writes these, and can anchor a callout to a UI element so it follows that element in every language.

## Themes

`theme.css` holds the app's look: fonts, colors, and where devices sit per gallery (`.phone`, `.tablet7`, `.tablet10`, `.readme`, with the card's layout words as classes).

`theme.js` exports optional hooks, called in this order with one context `ctx`:

| Hook | When | Use |
|---|---|---|
| `art(ctx)` | First | Return SVG for the background |
| `compose(ctx)` | Before captures load | Add elements: a brand mark, panels, notes |
| `layout(ctx)` | Once captures have their size | Adjust or redraw frames |
| `decorate(ctx)` | Last | Final touches, with `ctx.devices` measured; throw to fail the export |

`ctx` holds `W`, `H`, `kind` (gallery), `locale`, `index`, `slide` (the card), `slides`, `profile`, `config`, `main` (the card's element), and in `decorate`, `devices` with each one's `box` and `screen`. Mark anything that must stay on the canvas with `data-check-bounds`.

`studio/shapes.js` has helpers for themes: panorama coordinates and gradients (art that continues exactly across cards), `panoramaLights` (soft lights across the whole strip), color mixing, and Material 3 Expressive shapes.

**Continuous backgrounds.** A theme whose background runs across cards sets `continuous: true` (or a list of galleries) in `theme.js`. The exporter then compares the pixels where neighbouring cards meet and warns when the background doesn't continue. Draw such art in panorama coordinates, never per card.

## What the studio does for every theme

**Frames scale with their width.** Bezel and corner radius are fractions of the frame's width:

| Frame | Bezel | Radius |
|---|---|---|
| Phone | 0.02 | 0.09 |
| iPhone | 0.016 | 0.15 |
| Tablet | 0.018 | 0.05 |
| Landscape capture in either | 0.012 | 0.035 |

Override them in `studio.json`: `"frames": {"phone": {"bezel": 0.02, "radius": 0.09}, "fixed": ["banner"]}`. Layouts listed in `fixed` size their own frames in CSS; `"frames": false` turns scaling off. Frames get `device-portrait` or `device-landscape`.

**Devices are kept in bounds.** A frame stays `margin` px from the sides and top (default 0) and shows at least `visible` of itself (default 0.6); a landscape screen is never cut at the top or bottom. Allow exceptions per layout word, feature or gallery:

```json
"bounds": {"margin": 12, "visible": 0.7,
  "layouts": {"hang": {"top": true}, "bleed": {"right": true}, "tablet10": {"right": 0.22}, "compare": false}}
```

`right` takes `true` or the fraction that may run off; `false` skips a layout's check. A card's own `bounds` applies last.

**README layouts.** The `readme` gallery (2400 × 1260) has default positions for:

| Layout | Devices |
|---|---|
| `hero`, `fan` | Three phones: `left`, `center` (or `middle`), `right`; add `named` to lower them under a name banner |
| `trio` | A headline, then three phones `one`, `two`, `three`, each under its caption |
| `spread` | Headline left, a landscape tablet off the right edge, a phone in front |

`"identity": true` on a card replaces its headline with a name banner: the icon (`brand/icon.png`), the app's name and an optional `tagline` from the card's copy. Change the defaults in `studio.json` with `"identity": {"icon": "…", "name": "…"}`.

**Labels.** A device's `label` (with `*highlight*`) becomes a caption over its frame. Labels carry `--device-height` and `--tallest-device`, so a theme can line them up under the frames: `transform: translateY(calc(var(--tallest-device) + 30px))`.

## Rules every gallery follows

- Real captures only, with the real status bar and navigation. Sample data is local and fictional.
- Every capture keeps a real device ratio; the renderer refuses anything else.
- Devices are large and may run off an edge; copy and callouts never leave the canvas or cover the app.
- The set reads as one strip in the store carousel.
- One short headline with one highlighted phrase, one supporting line.
