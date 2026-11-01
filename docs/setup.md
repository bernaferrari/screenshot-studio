# Setting up an app

Everything an app needs lives in its `store-listing/` folder. `npx screenshot-studio init` creates a working starter; this page explains each file.

## init

Run it in the app's repository (or pass the folder as the first argument):

```sh
npx screenshot-studio init --name "My App" --package com.example.app   # Android, captured on an emulator
npx screenshot-studio init --name "My App" --screenshots ./shots        # from screenshots you already have
npx screenshot-studio init --name "My App" --platform ios               # App Store galleries (see Capturing)
```

| Option | Does |
|---|---|
| `--name` | The app's name (default: the folder's name) |
| `--package` | The application ID; the capture build and tour use it |
| `--screenshots` | Builds the galleries from existing images, with no emulator: a folder, sorted naturally (`2-x` before `10-x`; number the files to set the order), or a comma-separated list of files in card order. Each image goes to the phone, 7-inch or 10-inch gallery by its shape. |
| `--theme` | The starting look (default `starter`); `npx screenshot-studio themes` lists them, [Themes](themes.md) shows them |
| `--locales` | The languages, e.g. `en-US,de-DE` (the first is the default) |
| `--platform ios` | App Store galleries and an iOS simulator tour ([Capturing](capture.md#ios)) |

`init` never overwrites a file: run it again and it keeps what's there. It also installs a skill for Claude Code at `.claude/skills/store-screenshots/SKILL.md` ([Agents](agents.md)).

With no `--screenshots` and no `--package`, `init` looks for screenshots the app already has: fastlane's (`fastlane/metadata/android/en-US/images/…`, or `fastlane/screenshots/en-US` on iOS), then `screenshots/` or `docs/screenshots/`. It takes the app's name from fastlane's `title.txt` (`name.txt` on iOS) too.

For Android, `init` also adds the 1024 × 500 **feature graphic** Google Play asks every listing for (`en-US/graphics/feature-graphic.png`): the app's name and a tagline beside its first screen, with `brand/icon.png` when there is one. Write the tagline in `copy.json` under `feature-graphic`.

From screenshots, the first cards render right away: run `npx screenshot-studio export`. Otherwise the next steps are a capture build and the tour ([Capturing](capture.md)).

## The files

```
store-listing/
  studio.json          the app's settings: name, languages, capture, frames, bounds
  profiles.json        one entry per gallery: canvas size, capture size, device frame
  gallery.json         the cards: which capture, which layout, in which order
  theme.css            the look: type, colors, where devices sit
  theme.js             optional code: background art and extra elements
  assets/              the theme's fonts, if it ships any
  capture-emulator.py  the scene tour (capture-simulator.py on iOS; see Capturing)
  <locale>/copy.json   the words for each card
  <locale>/listing.json  the store text
  <locale>/raw/        captures, each with a .nodes.json layout map
  brand/               the app icon's layers (see App icons)
```

`npx screenshot-studio` finds `store-listing/` in the current folder or above it; `--listing path/to/app` points it elsewhere.

## The studio itself

The app keeps no copy of the studio. `npx screenshot-studio` serves its renderer and helpers at the app's `store-listing/studio/` address while it runs, so a theme's `import {panoramaGradient} from './studio/shapes.js'` just works. To pin a version for a project, run it as `npx screenshot-studio@0.0.1 …`.

Every command says when the app's copy is older than the package.

## check

```sh
npx screenshot-studio check           # every file, in about a second
npx screenshot-studio check --json    # the same, for tools
```

It reads every file without rendering: each JSON file against its schema, captures that are missing or match no capture size in `profiles.json`, cards without words and words no card uses, store text over Play's limits, and copy or store text still holding the starter's placeholder. Each problem comes with its file, where in the file, and what to do:

```
✗ gallery.json phone[1].raw: capture en-US/raw/phone/09-missing.png doesn't exist
    → Capture it (`npx screenshot-studio recapture`), add the file, or fix the path.
! en-US/copy.json home.title: is still the starter placeholder
    → Write a benefit headline for this screen.
```

`✗` is an error (the command fails), `!` a warning. Run it after every edit; `export` catches what only shows in a render.

**Schemas.** `schemas/` has a JSON Schema for `studio.json`, `profiles.json`, `gallery.json` and `copy.json`. A file that names its schema gets autocomplete and inline errors in most editors:

```json
{"$schema": "./studio/schemas/gallery.schema.json", "phone": [ … ]}
```

`init` adds the line to `profiles.json`, `gallery.json` and `copy.json` (`"../studio/schemas/copy.schema.json"`, one folder down). The studio ignores the key.

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

## Troubleshooting

| Problem | Fix |
|---|---|
| `EBADDEVENGINES … "yarn" does not match "npm"` | Your repository's `package.json` asks for another package manager, and npx honors it. Run `npx --force screenshot-studio …`, or `pnpm dlx` / `bunx screenshot-studio …`. |
| The first export pauses to download Chromium | Expected, once: the studio renders cards in Chromium and fetches the one its Playwright needs (about 100 MB). |
| `No store-listing/studio.json here or in any folder above` | Run the command in your app, or pass `--listing path/to/app`. Set one up with `npx screenshot-studio init`. |
| A capture is interrupted and the emulator keeps a strange size | `npx screenshot-studio reset`. |
