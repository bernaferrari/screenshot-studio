# Capturing

Captures come from the real app on an Android emulator. An app writes only the tour (which screens, in which order);
the studio sets the device up, reads and drives the app through [agent-device](https://github.com/callstackincubator/agent-device),
saves each screen with its layout map, and puts the device back.

## The tour

`store-listing/capture.tour.mjs` (`init --package` writes one):

```js
/** @type {import('screenshot-studio').Tour} */
export default {
  app: 'com.example.storecapture',
  activity: '.MainActivity',
  scenes: {
    light: {
      '01-home': null,                                 // the screen the app opens on
      '02-settings': d => d.tap('Settings'),           // by visible text or description
      '03-about': async d => { await d.tap('More'); await d.tap('About'); },
      '04-tablet-only': d => d.profile === 'phone' ? false : d.tap('Split view'),  // false skips the scene
    },
    dark: {
      '05-home-dark': null,
    },
  },
};
```

For each language, every capture profile in `profiles.json` (phone, 7-inch, 10-inch…) and each theme, the studio
starts the app fresh (data cleared, its language set), then walks the scenes in order: each says how to reach its
screen from the one before, and the studio saves it as `<locale>/raw/<profile>/<scene>.png` with its `.nodes.json`
layout map. Run one by hand with `npx screenshot-studio tour [--locale de-DE] [--profile phone] [--only 01-home]`.

Tap by what's on screen, not by coordinates: layouts move between phone and tablet, and the studio replays the taps in
every language (below).

| Tour key | Does |
|---|---|
| `app`, `activity` | The capture build's package, and its launch activity when it has several |
| `scenes` | `{light: {name: step}, dark: {...}}`; a step is `null`, a function of `d`, and returns `false` to skip |
| `profiles` | Scenes that replace `scenes` for one profile (`{slate7: {light: {...}}}`) |
| `start` | How each theme's run begins (default: launch with data cleared) |
| `setup`, `teardown` | Once per language, before and after (teardown also after a failure) |
| `run` | Instead of scenes: drive each profile yourself and call `d.shot()` (an app that captures with its own test) |
| `install`, `uninstall` | An APK the tour installs itself (relative to store-listing/), and removing the app afterwards |
| `settle`, `animated` | Extra milliseconds before each save, once the screen has settled; scenes that capture a frame of real motion |
| `battery`, `check` | The status bar's battery (default 100); a check every screen must pass (`nodes => boolean`) |
| `offline`, `animations`, `appLocale`, `tapMap` | Default `true`: network off, animations on, the app's language set, taps replayed by position |

## Writing a tour: look at the emulator

A tour taps through the app by what's on screen, so start by looking. `npx screenshot-studio screen` prints every
labelled element on the capture emulator with its bounds, read the same way a tour reads it, and saves a screenshot;
`--tap "Settings"` (or `--tap 540,1200`, or `--back`) moves first, `--json` prints it for tools. Each label is what
`d.tap("…")` takes. With the MCP server, an agent does the same with `emulator_screen` and `emulator_tap` and sees the
screen as it goes ([Agents](agents.md)).

If the capture emulator isn't running, every capture command says so and lists the ways forward: boot a dedicated
one with `recapture --boot`, or capture on an emulator that is already running with `--serial`.

## What the studio sets up, and restores

While the tour runs, the emulator gets:
- the profile's screen size and density;
- gesture navigation and System UI demo mode: 9:41, full battery and Wi-Fi, no notifications;
- font scale 1, heads-up notifications off, other apps' notifications snoozed;
- Wi-Fi and mobile data off (`offline: false` keeps them on);
- animations on, or off with `animations: false` (useful when an endless animation keeps the screen from settling);
- the app's language (Android 13+ per-app language, checked by reading it back).

Everything is restored afterwards, even after a failure. The studio only runs on an emulator, and refuses to start over
a display override left by an interrupted run; clear one with `npx screenshot-studio reset` (add `--serial` for
another emulator). Helper packages that would show up in an app list (SafetyCore, package verifiers) are hidden while
capturing, and a system dialog on screen ("isn't responding") fails the shot instead of ending up in it.

## The toolkit

What a step gets as `d` (typed as `TourDevice`). It works like an e2e test: every action waits for what it needs (the
element to show up, the app to come to the front), then for the screen to settle (two identical frames in a row), so a
tour has no sleeps or retry counts.

| Member | Does |
|---|---|
| `tap(label, {textOnly, above, below, timeout, key})` | Waits for the element whose text or description matches (a regular expression, matched whole), taps it, and waits for the screen to settle. `above: .3` keeps to the top 30% of the screen |
| `waitFor(label, {timeout})`, `isVisible(label)`, `tree()` | Wait for an element, ask whether one is there now, read every element |
| `waitUntil(() => …, {timeout, message})` | Wait for anything else: a capture build's seed marker (`d.appFiles().includes('seeded')`), say |
| `back`, `type`, `swipe`, `scroll(fraction, {up})`, `drag(pixels)`, `scrollTo(label, top)` | Move around; each settles |
| `launch({clear, activity, extras})` | Start the app, in front and settled; `clear` wipes its data; extras become intent extras |
| `setClock('09:41')` | Pin the device clock too (the host time comes back afterwards) |
| `night(on)`, `rotate`, `resize(w, h, dpi)` | Theme, orientation, a size outside profiles.json |
| `shot(name, {animated, check})` | Checks the screen (no system dialog, the right size), then saves it; scenes call it for you |
| `settle()`, `sleep(ms)` | Wait for the screen to stop changing; wait a set time (a recording that must run its course) |
| `appFiles()`, `topActivity()`, `shell`, `adb` | Anything else |
| `locale`, `defaultLocale`, `profile`, `theme`, `width`, `height`, `raw`, `options` | Where the run is |

A tour reads like a test of the app's story:

```js
scenes: {
  light: {
    '01-home': null,
    async '02-stats'(d) { await d.tap('Activity', {textOnly: true}); await d.tap('Insights'); },
    '03-blocked': d => d.scrollTo('Most blocked apps', .12),
    async '04-filters'(d) { await d.tap('Filters', {above: .3}); await d.tap('DNS lookups'); },
  },
},
```

## Every language from one tour

The default language runs first and records where each `tap`, `waitFor` and `scrollTo` found its element in the UI
tree (`<default>/raw/tap-map.json`). Other languages find the element at the same place, so a tour written with
English labels runs in German or Japanese unchanged. Taps are keyed by profile, theme and label; give `key` when one
label means different elements.

Each capture's layout map (`<name>.nodes.json`) lists the UI elements and their bounds. A callout anchored to an element follows it into every language; when it can't, the exporter keeps the reference position and flags it for review.

## One command: recapture

```sh
npx screenshot-studio recapture [locale…] [--boot] [--profile phone] [--no-build] [--no-capture] [--no-export] [--dry-run]
```

It reads the `capture` block in `studio.json` (`init --package` writes a starting one):

```json
"capture": {
  "build": "./gradlew :app:assembleStoreCapture -q",
  "install": [{"apk": "app/build/outputs/apk/storeCapture/app-storeCapture.apk", "package": "com.example.storecapture"}],
  "runs": [{"options": {"palette": "blue"}}, {"profiles": ["phone"], "locales": "default", "options": {"palette": "dark"}}],
  "retries": 2,
  "serial": "emulator-5554",
  "avd": "Pixel_9_API_36",
  "after": ["node scripts/refresh-readme.mjs"]
}
```

It builds, installs, then for each language (the default first) runs the tour once per run, retrying a failed run
after resetting the emulator. Then it exports each language (one failing language doesn't stop the rest) and runs
`after`.

| Capture key | Meaning |
|---|---|
| `build` | Shell command that builds the capture app, run from the repository |
| `install` | What to install before capturing: `apk` and its `package` |
| `runs` | How often to run the tour, and with what (below); default one run in every language |
| `retries` | Tries per run after a failure |
| `serial` | The capture emulator (default `emulator-5578`, or `CAPTURE_SERIAL`); it must be an emulator, never a phone |
| `avd` | The emulator image `--boot` starts (default: the first in `emulator -list-avds`) |
| `export` | A command to run per language instead of the studio's export (`{locale}` is replaced) |
| `after` | Shell commands once everything is exported |

| Run key | Default |
|---|---|
| `locales` | `"all"`; or `"default"`, or a list |
| `profiles` | every capture profile |
| `options` | what the tour reads as `d.options`; `${NAME}` in a value reads the environment. `tour --name value` passes one by hand |

| Option | Does |
|---|---|
| `--boot` | Starts the capture emulator headless when it isn't running, waits until Android has booted, then captures. It needs the Android SDK (`ANDROID_HOME`, or the default SDK folder). |
| `--profile phone` | One gallery's captures only |
| `--no-build`, `--no-capture`, `--no-export` | Skip a step |
| `--dry-run` | Print the commands without running them |

Use one capture emulator at a time: several at once can run the computer out of memory, and the system then kills one
mid-capture. Tours need Node 22.12 or later. A listing with a Python tour from an older version (`capture-emulator.py`)
gets an error saying so: write its scenes as `capture.tour.mjs`.

## Fictional apps

When the app lists other apps (a firewall, a launcher, an SDK tracker), install real code-free stub apps instead of faking the list:

```sh
npx screenshot-studio fixtures store-listing/fixture-apps.json --install emulator-5578
```

```json
{"apps": [{"package": "app.fernway.maps", "label": "Fernway Maps", "colors": ["#3fb27f", "#1e8a5c"],
  "glyph": "map", "internet": true, "category": "maps"}]}
```

Each entry gets a label, an adaptive icon (a Lucide glyph, `{"text": "Aa"}` or `{"svg": …}` on a gradient), a category and, if needed, `targetSdk`, `versionCode` and `versionName`. Builds are cached in `.fixture-apps/` beside the spec. `--uninstall` removes them; both only talk to an emulator.

## iOS

The same studio makes App Store screenshots from an iOS simulator. You need Xcode with a simulator runtime.

```sh
npx screenshot-studio init --platform ios --name "My App" --package com.example.myapp
npx screenshot-studio init --platform ios --screenshots ./simulator-shots   # or from screenshots you already have
```

`--platform ios` makes three galleries with the sizes App Store Connect asks for ([screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)):

| Gallery | Size | Captured on |
|---|---|---|
| `iphone` | 1320 × 2868 (6.9″) | the newest *iPhone … Pro Max* simulator |
| `iphone63` | 1206 × 2622 (6.3″, required) | nothing: it shows the `iphone` captures at its own size (`"inherits": "iphone"`) |
| `ipad` | 2064 × 2752 (13″, required for iPad apps) | the newest *iPad Pro 13-inch* simulator |

6.5″ (1284 × 2778) is only required when there's no 6.9″ set; add a profile for it if you want one. The iPhone galleries use the `iphone` frame (a thinner bezel and rounder corners); `theme.css` gets their positions appended after the theme's look.

Each iOS profile in `profiles.json` has `"platform": "ios"`, a capture size and the `simulator` it is captured on (a name from `xcrun simctl list devices available`, or a UDID). The capture size must be that simulator's screen in pixels; `shot` refuses anything else.

### The tour

The same `store-listing/capture.tour.mjs`, with the same toolkit: agent-device reads the simulator's accessibility tree
and taps through XCTest, so `d.tap('Settings')`, `waitFor`, `scrollTo` and the tap map work as on Android (positions
are in screenshot pixels on both). `init --platform ios` writes one:

```js
export default {
  app: 'com.example.myapp',
  // Each theme starts the app afresh, in the capture's language; extras become launch arguments.
  start: d => d.launch({extras: {screenshotScene: 'home'}}),
  scenes: {
    light: {
      '01-home': null,
      '02-settings': d => d.tap('Settings'),
      async '03-share'(d) { await d.openUrl('myapp://share'); },
    },
    dark: {'04-home-dark': null},
  },
};
```

While the tour runs, each simulator gets a status bar at 9:41 with full battery, Wi-Fi and signal and no carrier
(`simctl status_bar override`), and the default text size. Afterwards the status bar is cleared, appearance and text
size are put back, and simulators the tour booted are shut down. The first iOS capture on a machine builds
agent-device's XCTest runner, which takes a few minutes once.

| iOS member | Does |
|---|---|
| `launch({extras, clear})` | Restart the app; `extras: {screenshotScene: 'home'}` becomes `-screenshotScene home` (UserDefaults), with `-AppleLanguages (de-DE) -AppleLocale de_DE` for the capture's language. `clear` reinstalls the app (a fresh start), when the tour or studio.json installs it |
| `openUrl(url)` | Open a deep link in the running app (it keeps its language) |
| `night(on)` | Light or dark appearance (scenes do this for you) |
| `privacy('grant', 'photos')` | Grant a permission up front, so no alert covers a scene |
| `simctl(...words)` | Anything else |

`back` uses the navigation bar's back button (or the edge swipe). Android-only members (`adb`, `shell`, `appFiles`,
`resize`, `setClock`) say so when called on iOS.

A capture or debug build can still open each screen itself from a launch argument, filled with fictional sample data,
which keeps a tour to `launch` calls:

```swift
#if DEBUG
// -screenshotScene settings arrives as a UserDefaults value in the argument domain.
if let scene = UserDefaults.standard.string(forKey: "screenshotScene") { router.show(scene, sampleData: true) }
#endif
```

**Languages.** The language arguments set the app's language for that launch only; the simulator's system language
stays as it is. So the app is in German, but text drawn by iOS outside the app (the iPad status bar's app name, a share
sheet) is in the simulator's language. The clock shows 9:41 or 09:41 depending on the simulator's region format.

### recapture

```json
"capture": {
  "platform": "ios",
  "build": "xcodebuild -scheme \"My App\" -configuration Debug -sdk iphonesimulator -derivedDataPath build/capture -quiet build",
  "install": [{"app": "build/capture/Build/Products/Debug-iphonesimulator/My App.app", "package": "com.example.myapp"}],
  "runs": [{"locales": "all"}]
}
```

With `"platform": "ios"`, `recapture` builds, installs the `.app` on every simulator the capture profiles use, runs the
tour per language, and exports. `--boot` boots those simulators first and leaves them running; `--simulator NAME` (or
`capture.simulator`) is the simulator for profiles that name none. A failed run resets the simulators (`npx
screenshot-studio reset --simulator NAME` does the same by hand) and tries again. `npx screenshot-studio screen
--simulator NAME` shows a booted simulator's screen and labels, as for the emulator.

The exporter's store text checks and `export --fastlane` are still written for Google Play.
