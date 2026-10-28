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

- **Real app only.** Captures come from the running Android app on the one capture emulator, with Android's own
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
- **Emulator hygiene.** Every app uses the same `Resizable_Experimental` AVD on port 5578 (`emulator-5578`); never create per-app AVDs, never a physical phone. Snooze other apps' notifications,
  turn the network off for fixture captures, uninstall other apps' capture builds if they steal focus, and reset
  `wm size`/`wm density` if a run is interrupted (the script refuses to start otherwise).
- **Drive by visible text.** Tap tabs and buttons by their on-screen label from the node tree, not by fixed
  coordinates; layouts shift between phone and tablet. Clear app data before each device size.
- **Check the status bar in light mode.** Light screens need dark status bar icons; if the app gets this wrong,
  fix the app, not the screenshot.
- **Fictional third-party apps** (a firewall, a launcher) need drawn icons and names, never real brands. When
  the app lists apps through `PackageManager`, install real code-free stub APKs instead of patching the app:
  `node store-listing/studio/fixture-apps.cjs store-listing/fixture-apps.json --install emulator-5578` builds
  one per entry (label, gradient adaptive icon with a Lucide glyph, INTERNET permission, app category). The
  capture build then only seeds rules and traffic for those packages, looked up by package name.
- **Pin the clock, not just the status bar.** If screens show timestamps or "last hour" windows, set the
  emulator clock to 9:41 (`settings put global auto_time 0`, `cmd alarm set-time <ms>`) before the app seeds
  its data, so log times end at the status-bar time; restore the host time afterwards. Insert seeded logs
  oldest first: lists that order by row id otherwise show last week at the top.
- **Seed, then relaunch.** View models that read once at start (totals, counts) miss data seeded after launch.
  Let the first start seed (write a marker file, poll it with `run-as`), force-stop, and start again.
- **Endless animations block uiautomator.** A pulsing hero keeps the UI from going idle, so dumps hang. Set the
  three animation scales to 0 during capture (most apps then show their reduced-motion state) and restore them.
- **Match filter chips above the list.** A label like "Blocked" also appears in rows; restrict taps to the top
  of the screen (the Re-Rethink script takes an `above` fraction).
- **Apps that show another computer** (remote desktops, companions) capture against a real host when
  one is available: open fictional content on it over SSH from a script kept in the repo
  (`store-listing/host/` in Lumina), close every window and delete the folder afterwards, and remove
  the emulator's pairing from the host. Dismiss the host's desktop notifications first and check
  every frame for names, paths and other people's devices (discovery lists show them; turn
  discovery off in the capture build). Native libraries must match the app's source revision.
- **Pillow is optional.** A capture script needs only `adb exec-out screencap -p`: read the size
  from the PNG header and write the bytes; not every Mac has Pillow.
- **Look at the 10-inch captures for layout bugs.** Width-limited columns can leave the window background
  bare (black side bars); fix the app, then recapture.

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

Type: a two-line headline fits at about 108px on a 1080px phone card; letter-spacing tighter than −0.02em
starts merging words in bold display faces.

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
