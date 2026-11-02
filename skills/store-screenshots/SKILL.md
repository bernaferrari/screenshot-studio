---
name: store-screenshots
description: Make, fix, translate or refresh an app's Google Play / App Store screenshots, feature graphic and README images from real app screens, with Screenshot Studio. Use whenever the user asks for store screenshots, a store listing's images, marketing or README art of their app, or to capture, restyle or translate them.
---

# Store screenshots with Screenshot Studio

Screenshot Studio turns real captures of an app into store cards and README art. You edit plain files (words, layout,
look); the studio renders them in a browser and checks them like a store reviewer would. You work in one loop:

**edit → check → render → look → refine.** Never call a card done without looking at its image.

## 1. Start

Everything lives in `store-listing/` in the app's repository. If `store-listing/studio.json` exists, it is set up: skip
to section 2. Otherwise pick the first path that fits:

| The user has | Run |
|---|---|
| Screenshots in a folder | `npx screenshot-studio init --name "App" --screenshots ./folder --theme aurora` |
| Screenshots per language (`./folder/en-US/`, `./folder/de-DE/`…) | the same: every language lands on the same cards |
| fastlane's screenshots | `npx screenshot-studio init --theme aurora`: it finds them in every language, and the app's name |
| An Android app and no screenshots | `npx screenshot-studio init --name "App" --package com.example.app`, then section 6 |
| An iOS app and no screenshots | the same with `--platform ios` (App Store sizes, a simulator tour), then section 6 |
| Nothing yet, wants to see it | `npx screenshot-studio demo` (a finished example; `--theme paper`, `--3d`) |

`npx screenshot-studio themes` lists the looks. `init` prints what to do next; do it.

## 2. Tools

Prefer the MCP server (`claude mcp add screenshot-studio -- npx screenshot-studio mcp`, run from the app):

| Tool | Use it to |
|---|---|
| `describe_listing` | Learn the galleries, cards, captures, headlines and output files. Call it first. |
| `check` | Validate every file in a second. Run it after every edit. |
| `render_card` | See one card. Its `layout` gives every device, the headline and each callout in card pixels. |
| `export` | Render and check everything, and write the images. |
| `view_image` | Look at a card, a capture, or `en-US/contact-phone.jpg` (the whole strip at once). |
| `emulator_screen`, `emulator_tap` | See and move around the app on the capture emulator (section 6). |

Without MCP, the CLI does the same: `check`, `export --kind phone --card 0`, `export`, `screen`; add `--json` for
results you can parse, and open the images yourself.

## 3. What to edit

| To change | Edit |
|---|---|
| Headline and supporting line of a card | `<locale>/copy.json`, keyed by the card's `feature`: `*highlight*`, `\n` for a new line |
| Which cards, their order, captures, layout words, callouts | `gallery.json` |
| Fonts, colors (`--paper`, `--ink`, `--accent`), where devices sit | `theme.css` |
| Background art, extra elements, real 3D devices (`depth: true`) | `theme.js` |
| Image sizes, capture sizes | `profiles.json` |
| Store text (title, short description) | `<locale>/listing.json` |

**Placing devices.** Cards use layout words in `gallery.json`: `big` (one large device), `hang` (from the top, copy
below), `duo` (two devices), plus `tilt` beside any of them. Themes place them with variables per gallery in
`theme.css`: `.phone{--device-top:600px;--device-left:84px;--hang-top:-640px;--duo-width:540px;--duo-step:180px}`
(full list in `docs/themes.md`). Change a variable, render, and read `layout` to confirm the numbers. One card placed by
hand: an ordinary rule wins, `.phone .home .device{top:560px}`.

**Callouts** magnify part of a screen: `"callouts": [{"x": 40, "y": 520, "w": 1000, "h": 180, "mag": 1.2, "radius": 24}]`,
in capture pixels. With `"target": "<path>", "targetMode": "element"` the callout follows that UI element into every
language, but that needs the capture's layout map (`*.nodes.json`), which only the studio's own captures write.

## 4. Read what check and export tell you

Every issue carries a fix; do what it says. The common ones:

| Message | Do |
|---|---|
| `is still the starter placeholder` | Write a real headline (or line) for that card |
| `field(s) not translated yet` | Translate those fields from the default language (section 5) |
| `copy shrunk to N%` / `does not fit` | Shorten the headline; don't shrink the type |
| `is left on a short last line` | Reword so the last line isn't one or two words |
| `Screen leaves the side / top of the card` | Move or shrink the device (section 3) |
| `takes at most 8 per device type` | Keep the best 8 (Play; 10 on the App Store) and cut the rest from `gallery.json` |
| `background breaks at the seam` | Draw the background across the strip (`panoramaGradient` from `./studio/shapes.js`) |
| `en-US capture: phone/…` (a card's note) | That language has no screen of its own there yet: fine until recaptured |

## 5. Languages

`init` already made a `copy.json` for each language it found, with every field empty. For a new one:
`npx screenshot-studio locales --init de-DE`. Translate each empty field from the default language: keep the
`*highlight*` around the phrase that carries the meaning, keep `\n` breaks where the line wants one, keep it as short
as the original, and keep names and sample data unchanged. Then `check` until no field is listed, and look at the
contact sheet in that language: long languages (German, Finnish) are where copy stops fitting.

## 6. Capturing the app

Android captures come from a dedicated emulator (`emulator-5578`), never a phone; iOS ones from the simulator each
profile names. If one isn't running, the error says how to start it (`recapture --boot`) or which to use (`--serial`,
`--simulator`). The same tour file and calls drive both.

1. The app needs a capture build that opens on believable, fictional sample data (`docs/playbook.md`, section 1).
2. Look at the app: `emulator_screen` shows the screen and every element's label; `emulator_tap` taps a label, a point
   or `back` (both take `simulator` for iOS). Find each screen the cards need.
3. Write what you did as the scenes of `store-listing/capture.tour.mjs`, each named for the capture it saves and
   saying how to reach it from the one before: `'02-settings': d => d.tap('Settings')`, with the labels you saw in
   the default language (other languages replay the same taps). `null` saves the screen as it is; returning `false`
   skips a scene on that device. Like an e2e test, every action waits for its element and for the screen to settle:
   write no sleeps or retries. The `Tour` type in `studio/types.d.ts` lists everything (`docs/capture.md`).
4. `npx screenshot-studio tour --profile phone` runs it once to check; then `npx screenshot-studio recapture` builds,
   captures every language and every device size, and exports.

## 7. What good looks like

Judge every card, then the contact sheet, against this:

- **The app is the hero.** The real screen is large (about two thirds of the card) and may run off an edge. No small
  phones floating in space.
- **One idea per card.** A short benefit headline ("Know when a page changes"), not a feature name ("Change
  detection"), one highlighted phrase, one supporting line. Readable at thumbnail size.
- **One system.** Every card shares a structure; vary one thing, not the composition. The strip reads as one.
- **Real screens only.** Never paint or fake UI; fictional but believable data; a clean 9:41 status bar.
- **Order.** The first two cards show the core value; then one feature per card; a light/dark pair; tablets last.

## 8. Before you finish

- `check` shows no errors and `export` no warnings (or each remaining warning is one the user chose to keep).
- You looked at every card and at the contact sheet of each language.
- Tell the user what changed and which images to look at (`store-listing/en-US/contact-phone.jpg`), and anything you
  couldn't do (missing captures, languages left untranslated).
- `store-listing/` is the source; commit it. Rendered images regenerate with `export`.
