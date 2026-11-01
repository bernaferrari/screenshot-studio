# Capturing

Captures come from the real app on an Android emulator. An app writes only the tour (which screens, in which order); the studio's `capture.py` takes care of the device.

## The tour

`store-listing/capture-emulator.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'studio'))
from capture import Device, parser

args = parser(__doc__).parse_args()            # --serial, --profile, --locale, --only
with Device(args, 'com.example.storecapture', '.MainActivity') as d:
    for profile in d.profiles():               # phone, 7-inch, 10-inch… from profiles.json
        d.night(False)
        d.launch(clear=True)                   # clear data, set the language, start
        d.shot('01-home')                      # <locale>/raw/<profile>/01-home.png + .nodes.json
        d.tap('Settings')                      # by visible text or description
        d.shot('02-settings')
```

Tap by what's on screen, not by coordinates: layouts move between phone and tablet, and the studio replays the taps in every language (below).

## What `Device` sets up, and restores

While the tour runs, the emulator gets:
- the profile's screen size and density;
- gesture navigation and System UI demo mode: 9:41, full battery and Wi-Fi, no notifications;
- font scale 1, heads-up notifications off, other apps' notifications snoozed;
- Wi-Fi and mobile data off (`offline=False` keeps them on);
- animations on, or off with `animations=False` (useful when an endless animation blocks the UI tree);
- the app's language (Android 13+ per-app language, checked by reading it back).

Everything is restored on exit, even after a failure. `Device` only runs on an emulator, and refuses to start over a display override left by an interrupted run; clear one with `python3 store-listing/studio/capture.py reset`.

It also recovers from a busy emulator: a stuck UiAutomation client, an "isn't responding" dialog, a slow first draw, and a full disk during install. Helper packages that would show up in an app list are hidden.

## The toolkit

| Method | Does |
|---|---|
| `tap(label, wait, text_only=, within=, key=)` | Taps the node whose text or description matches (a regular expression); `within` limits it to a region |
| `find`, `present`, `wait_for` | Look for a node |
| `back`, `key`, `type`, `swipe`, `scroll(fraction, up=)`, `drag(pixels)`, `scroll_to(label, top)` | Move around |
| `launch(activity, clear, **extras)` | Start the app, optionally clearing its data |
| `set_clock('09:41')` | Pin the device clock too (the host time comes back on exit) |
| `night(on)`, `rotate`, `use(profile, w, h, dpi)` | Theme, orientation, sizes outside profiles.json |
| `shot(*targets, animated=, check=)` | Checks the screen (the app in front, no system dialog, the right size), then saves it |
| `shell`, `adb` | Anything else |

A `shot` target that's a plain name goes to `<locale>/raw/<profile>/<name>.png`, with its `.nodes.json` layout map. `--only a,b` skips the other shots.

## Every language from one tour

The reference language runs first and records each tap's position in the UI tree (`<default>/raw/tap-map.json`). Other languages replay those positions, so a tour written with English labels runs in German or Japanese unchanged. `d.scope` (default `<profile>|<theme>`) keys the taps.

Each capture's layout map (`<name>.nodes.json`) lists the UI elements and their bounds. A callout anchored to an element follows it into every language; when it can't, the exporter keeps the reference position and flags it for review.

## One command: `recapture.cjs`

```sh
node store-listing/studio/recapture.cjs [locale…] [--profile phone] [--no-build] [--no-capture] [--no-export] [--dry-run]
```

It reads the `capture` block in `studio.json`:

```json
"capture": {
  "build": "./gradlew :app:assembleStoreCapture -q",
  "install": [{"apk": "app/build/outputs/apk/storeCapture/app-storeCapture.apk", "package": "com.example.storecapture"}],
  "runs": [{"args": ["--theme", "light"]}, {"args": ["--theme", "dark"], "profiles": ["phone"], "locales": "default"}],
  "retries": 2,
  "after": ["python3 scripts/refresh_readme_assets.py"]
}
```

It builds, installs, then for each language (the reference first) runs each run's tour once per profile, retrying a failed run after resetting the emulator. Then it exports each language (one failing language doesn't stop the rest) and runs `after`.

| Run key | Default |
|---|---|
| `script` | `store-listing/capture-emulator.py` |
| `locales` | `"all"`; or `"default"`, or a list |
| `profiles` | every capture profile; `false` passes none |
| `args` | extra arguments; `${NAME}` reads the environment |

Tours run through `uv run --with pillow`. Use one capture emulator at a time (`CAPTURE_SERIAL`, default `emulator-5578`).

## Fictional apps

When the app lists other apps (a firewall, a launcher, an SDK tracker), install real code-free stub apps instead of faking the list:

```sh
node store-listing/studio/fixture-apps.cjs store-listing/fixture-apps.json --install emulator-5578
```

Each entry gets a label, an adaptive icon (a Lucide glyph or text on a gradient), a category and, if needed, `targetSdk`, `versionCode` and `versionName`. Builds are cached in `.fixture-apps/` beside the spec.
