---
name: store-screenshots
description: Make or improve an app's Google Play / App Store screenshots and README images from real app screens with Screenshot Studio. Use when the user asks for store screenshots, a Play or App Store listing, marketing images, a feature graphic, README hero images, or to translate or refresh them.
---

# Store screenshots with Screenshot Studio

Screenshot Studio turns real captures of the app into store and README images. You edit files (look, layout, words); the studio renders and checks them. Work in this loop: **edit → check → render → look → refine.** Never call a card done without looking at the image.

## 1. Set up (once)

In the app's repository:

- **The user has screenshots already** (or you can take them): `npx screenshot-studio init --name "App" --screenshots ./folder`. Phone and tablet shapes sort themselves into galleries. This is the fastest start; prefer it.
- **Android app to capture automatically:** `npx screenshot-studio init --name "App" --package com.example.app`, then write the tour in `store-listing/capture-emulator.py` and run `npx screenshot-studio recapture --boot`. The app needs a capture build with believable, fictional sample data (see `docs/playbook.md`, section 1).
- `npx screenshot-studio themes` lists starting looks; pass `--theme <name>`.

Already set up? There's a `store-listing/studio.json`. Run `npx screenshot-studio sync` if `check` says the studio copy is old.

## 2. The files you edit

| To change | Edit |
| --- | --- |
| Which cards, their order, their captures and layout | `store-listing/gallery.json` |
| Headlines and supporting lines | `store-listing/<locale>/copy.json` |
| The look: fonts, colors, where the device sits | `store-listing/theme.css` |
| Background art, extra elements | `store-listing/theme.js` |
| Image sizes | `store-listing/profiles.json` |

Headline markup in copy: `*highlight*`, `\n` for a new line. Each card's words are keyed by its `feature`.

## 3. The loop

With the MCP server (`claude mcp add screenshot-studio -- npx screenshot-studio mcp`), use its tools: `describe_listing` first, `check` after each edit, `render_card` to see a card, `export` then `view_image en-US/contact-phone.jpg` to see the whole strip. Without it, use the CLI and read the images:

```sh
npx screenshot-studio check                              # seconds; fix every ✗ before rendering
npx screenshot-studio export --kind phone --card 0       # one card: store-listing/en-US/phone/…
npx screenshot-studio export --locale en-US              # everything, then look at en-US/contact-phone.jpg
```

Read the images you rendered (scale large ones down first, e.g. `sips -Z 1400 in.jpg --out /tmp/x.jpg`). `export --json` gives the files written and each card's notes.

## 4. What good looks like

Judge every card against this before you show it:

- **The app is the hero.** The real screen is large (about two thirds of the card) and may run off an edge. No small phones floating in space.
- **One idea per card.** One short headline with one highlighted phrase, one supporting line. Readable at thumbnail size: if you squint at the contact sheet, can you read every headline?
- **One system.** Every card shares a structure; vary color or one element, not the composition. The set reads as one strip.
- **One continuous background** under the strip (a gradient or glow laid out in panorama coordinates: `panoramaGradient` and `panoramaLights` from `./studio/shapes.js`), not decoration per card.
- **Upright devices** unless a tilt carries the idea. Frames that belong to the look, not default black.
- **Nothing fake.** Real screens only, real status bar, fictional but believable data. Never paint UI.
- **Order:** the first two cards show the core screens, then one feature per card, a light/dark pair, tablets last.

Common fixes: copy shrunk to fit → shorten the headline. Device out of bounds → move it in `theme.css` (`.phone .<layout> .device{left, top, width}`). Background breaks at a seam → draw it with the panorama helpers in `theme.js` and set `continuous: true`. A card doesn't look like the others → make it use the same layout word.

## 5. Languages

`npx screenshot-studio locales --init de-DE` adds a language with empty fields; fill `de-DE/copy.json` (keep sample names and data in English). Captures can stay English until recaptured; the export says which cards borrow them. `export --strict` fails until a language is complete.

## 6. Before you finish

- `check` shows all good, and `export` has no warnings.
- You've looked at the contact sheet and every card, and each one passes section 4.
- Tell the user what changed and show them `store-listing/en-US/contact-phone.jpg`.
- Commit `store-listing/` (the `.gitignore` there keeps other languages' images out).
