# Screenshot Studio playbook

How to take an app from nothing to a strong store listing and README, learned on a run of real apps. Written for
people and agents alike: follow it in order, and update it when a new app teaches something.

## 0. Set up

```sh
npx screenshot-studio init --name "App" --package com.example.app    # capture on an emulator
npx screenshot-studio init --name "App" --screenshots ./shots        # or start from screenshots you have
```

This creates `store-listing/` (studio.json, profiles.json, gallery.json, theme.css/js, en-US copy and listing,
.gitignore, README), copies the studio in, and installs the agent skill ([Agents](agents.md)). Everything you
tweak lives in those files ([Setting up an app](setup.md)). Pick a starting look with `--theme` ([Themes](themes.md)).

## 1. Capture real screens

- **Real app only.** Captures come from the running app on an emulator (or an iOS simulator), with the system's
  own status bar and navigation. Never paint UI, never fake numbers.
- **A capture build.** Add a build type or flavor with its own application ID suffix (`.screenshots`,
  `.storecapture`) that seeds fictional, believable sample data and never touches real user data or the network.
  Production builds must not contain the fixtures.
- **Believable sample data.** Plausible fictional names and places (northwind.shop, Lumen 27 Display), real-looking
  numbers, and at least one story with a visible change (a price drop, a signal dip and recovery). `.example`
  domains look fake; avoid them.
- **Light mode by default.** Light screens read better on most canvases. Use dark only where it is the point.
- **Script it.** Write only the scene tour: `store-listing/capture-emulator.py` on the studio's `Device`
  ([Capturing](capture.md)). It sets display size and density for phone (1080×2340 @400–420), 7-inch
  (1200×1920 @320) and 10-inch (1920×1200 @240), System UI demo mode (9:41, full battery and Wi-Fi), gesture
  navigation and the app language, saves `<locale>/raw/<profile>/<name>.png` with a `.nodes.json` layout map, and
  resets everything afterwards. Describe the build and the runs in studio.json's `capture` block; then
  `npx screenshot-studio recapture --boot` starts the emulator, rebuilds, captures and exports in one command.
- **One dedicated emulator, one at a time.** Capture on an emulator kept for captures (`capture.serial` and
  `capture.avd` in studio.json), never a physical phone, and reuse it for every app rather than making one per
  app. Several emulators at once can run the computer out of memory, and the system then kills one mid-capture:
  check `adb devices` first and capture apps one after another.
- **Emulator hygiene.** `Device` snoozes other apps' notifications, turns the network off, hides helper packages
  and recovers from a stuck UiAutomation or a full disk. Uninstall other apps' capture builds if they steal focus,
  and run `python3 store-listing/studio/capture.py reset` if a run is killed (a capture refuses to start over a
  leftover display override).
- **Drive by visible text.** Tap tabs and buttons by their on-screen label from the node tree, not by fixed
  coordinates; layouts shift between phone and tablet. Clear app data before each device size.
- **Check the status bar in light mode.** Light screens need dark status bar icons; if the app gets this wrong,
  fix the app, not the screenshot.
- **Fictional third-party apps** (a firewall, a launcher) need drawn icons and names, never real brands. When
  the app lists apps through `PackageManager`, install real code-free stub APKs instead of patching the app:
  `npx screenshot-studio fixtures store-listing/fixture-apps.json --install <emulator>` builds one per entry
  (label, gradient adaptive icon with a Lucide glyph, INTERNET permission, app category). The capture build then
  only seeds data for those packages, looked up by package name.
- **Pin the clock, not just the status bar.** If screens show timestamps or "last hour" windows, pin the device
  clock to 9:41 (`d.set_clock('09:41')`) before the app seeds its data, so log times end at the status-bar time;
  the host time comes back afterwards. Insert seeded logs oldest first: lists that order by row id otherwise show
  last week at the top.
- **Seed, then relaunch.** View models that read once at start (totals, counts) miss data seeded after launch.
  Let the first start seed (write a marker file, poll it with `run-as`), force-stop, and start again.
- **Endless animations block uiautomator.** A pulsing hero keeps the UI from going idle, so dumps hang. Open the
  `Device` with `animations=False` (most apps then show their reduced-motion state); `shot(name, animated=True)`
  lets the real motion run for one frame.
- **Match filter chips above the list.** A label like "Blocked" also appears in rows; restrict taps to the top
  of the screen (`d.tap('Blocked', within=lambda b: b[1] < d.height * .25)`).
- **Apps that show another computer** (remote desktops, companions) capture against a real host when one is
  available: open fictional content on it from a script kept in the repository, close every window and delete
  the content afterwards, and remove the emulator's pairing from the host. Dismiss the host's desktop
  notifications first and check every frame for names, paths and other people's devices (discovery lists show
  them; turn discovery off in the capture build). Native libraries must match the app's source revision.
- **Pillow comes from uv.** `recapture` runs tours with `uv run --with pillow` when uv is installed; without it,
  the system Python needs Pillow.
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

Checklist for each card: readable at store thumbnail size, one idea, the app visible, no clipped glyphs or
cut tablets (except intentional bleeds), copy never overlaps the app, no word left alone on a last line.

Structure that works: the first two cards show the core screens large; middle cards one feature each; a
composed card (two phones stacked with copy between them, or a light/dark pair); tablets last. Up to 8 phone
cards. The 7-inch and 10-inch follow the same system (10-inch: copy left, product right).

## 3. Export and check

```sh
npx screenshot-studio check                  # after every edit
npx screenshot-studio studio --open          # the editor
npx screenshot-studio export --locale en-US
```

Review every card at full size, the contact sheet (does it read as one set?), and the editor's store preview at
thumbnail size. Fix every export warning, short last lines included. Set `"supersample": 2` in studio.json for
crisp scaled UI.

## 4. README

The README is art too, rendered by the same studio from the `readme` gallery (2400 × 1260, default language only).

- **Open with the app.** A header (the name beside one large device) or a hero (icon, name and tagline over three phones). Then one bold line and two or three sentences.
- **Install badges right after**, the same height: Google Play, F-Droid, Obtainium, the App Store. Link the web demo if there is one.
- **Two or three feature images, not a gallery.** What works: tinted panels, each with its own short headline and one device; one headline over three captioned phones. Each image gets a short section and two to four bullets.
- **Tablets and dark mode once,** in one image.
- **A before and after** when the app grew from another: the old app beside the new, one or two pairs.
- **Privacy once,** a few lines. Build instructions live in their own document; end with one small pointer to it.
- No captions under images that already carry a headline. Check it renders with GitHub's styles before committing (`npx screenshot-studio readme`).

## 5. Git

Commit `en-US` captures and exports (the README uses them) and every locale's `copy.json`/`listing.json`.
Other locales' `raw/` captures and exports regenerate from the scripts and are git-ignored (see the scaffolded
`.gitignore`), so the repository stays small.

## 6. Ship

`npx screenshot-studio export --fastlane` writes the store text and phone screenshots into
`fastlane/metadata/android/` for F-Droid and fastlane `supply` (see [Languages and export](languages-and-export.md)).
Apps that upload to Play from fastlane keep their lanes in `fastlane/Fastfile`.
