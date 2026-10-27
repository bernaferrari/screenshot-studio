# Screenshot Studio playbook

How to take an app from nothing to a 9/10 Play listing and README, learned on Calcula, ChangeDetection and
WiFi Weakspot. Written for agents: follow it in order, and update it when a new app teaches something.

## 0. Scaffold

```sh
node ~/Documents/screenshot-studio/init.cjs /path/to/app --name "App" --package com.example.app
```

This creates `store-listing/` (studio.json, profiles.json, gallery.json, theme.css/js, en-US copy and listing,
.gitignore, README) and syncs `studio/`. Everything an agent tweaks lives in those files.

## 1. Capture real screens

- **Real app only.** Captures come from the running Android app on a dedicated emulator, with Android's own
  status bar and gesture pill. Never paint UI, never fake numbers.
- **A capture build.** Add a build type or flavor with its own application ID suffix (`.screenshots`,
  `.storecapture`) that seeds fictional, believable sample data and never touches real user data or the network.
  Production builds must not contain the fixtures.
- **Believable sample data.** Plausible fictional names and places (northwind.shop, Lumen 27 Display), real-looking
  numbers, and at least one story with a visible change (a price drop, a signal dip and recovery). `.example`
  domains look fake; avoid them.
- **Light mode by default.** Light screens read better on most canvases. Use dark only where it is the point.
- **Script it.** One script per app sets display size and density for phone (1080×2340 @400–420), 7-inch
  (1200×1920 @320) and 10-inch (1920×1200 @240), System UI demo mode (9:41, full battery and Wi-Fi), gesture
  navigation, and the app language; then drives the scenes and saves `<locale>/raw/<profile>/<name>.png` plus a
  `.nodes.json` layout sidecar. It resets display overrides and demo mode afterwards.
- **One emulator at a time.** A 32 GB Mac runs out of memory with several emulators, and the system kills one mid-capture. Check `adb devices` first and queue apps instead of capturing in parallel.
- **Emulator hygiene.** Use your own AVD and port; never a physical phone. Snooze other apps' notifications,
  turn the network off for fixture captures, uninstall other apps' capture builds if they steal focus, and reset
  `wm size`/`wm density` if a run is interrupted (the script refuses to start otherwise).

## 2. Design the set

What users rejected, and what they kept:

| Rejected | Kept |
|---|---|
| Small devices floating in empty space | Real screens large, often running off the bottom edge |
| Every card composed differently (no system) | One repeated structure, varied by colour and one twist |
| Lifted UI pasted over the same screen (looks fake) | Plain real screens; a crop of real UI only when there is no phone |
| Continuous lines, seam discs, edge fades ("tape") | One continuous field (gradient or glow) under the whole strip |
| Random blobs and decoration | One on-brand motif (graph paper, Wi-Fi glow, viewfinder corners) |
| Most devices rotated | Upright by default; 3D only where it carries the idea |
| Long, verbose copy | One headline with one highlighted phrase, one short line |
| Black device frames everywhere | Frames that belong to the card (tinted, or app-coloured) |

Checklist for each card: readable at Play thumbnail size, one idea, the app visible, no clipped glyphs or
cut tablets (except intentional bleeds), copy never overlaps the app.

Structure that works: the first two cards show the core screens large; middle cards one feature each; a
composed card (two phones stacked with copy between them, or light/dark pair); tablets last. Up to 8 phone
cards. The 7-inch and 10-inch follow the same system (10-inch: copy left, product right).

## 3. Export and check

```sh
node store-listing/studio/server.cjs 8790          # editor
node store-listing/studio/export.cjs --locale en-US
```

Review every card at full size, plus the joined contact sheet (does it read as one set?). Set
`"supersample": 2` in studio.json for crisp scaled UI.

## 4. README

- Hero (banner or icon + tagline), a Google Play badge linking `https://play.google.com/store/apps/details?id=<package>`.
- Feature images in a table row (4 across), then 2–3 short sections, each 2–3 sentences.
- Tablets once, privacy once, a short "Good to know" if the app measures something.
- No duplicated captions under images that already carry a headline.
- Build instructions live in `docs/DEVELOPMENT.md`; the README ends with one small pointer to it.
- Preview it rendered with GitHub's styles before committing.

## 5. Git

Commit `en-US` captures and exports (the README uses them) and every locale's `copy.json`/`listing.json`.
Other locales' `raw/` captures and exports regenerate from the scripts and are git-ignored (see the scaffolded
`.gitignore`), so the repository stays small. `play-staging/` is never committed.

## 6. Ship

Fastlane staging (`prepare-play.mjs`) validates every locale and stages `play-staging/` for `supply`.
Calcula has the reference implementation; it will move into the studio once it settles.
