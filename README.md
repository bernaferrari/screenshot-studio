# Screenshot Studio

One store-screenshot workflow for every app: real device captures composed in HTML into Play (and App Store) artwork for phone, 7-inch and 10-inch tablets, and desktop. Each app keeps its own look; the editor, gallery format, renderer, callouts, exporter and checks are shared.

This folder is the master copy. `./sync.sh <app-repo>` copies `studio/` into `<app-repo>/store-listing/studio/`, so every repository still builds on its own. Never edit a synced copy; change it here, bump `studio/VERSION`, and sync. `./sync.sh <app-repo> --check` reports drift.

## Interface source and build

The editor is a React application built with the official **shadcn/ui** components and Tailwind CSS. The desktop project navigation uses shadcn Sidebar; mobile uses its Sheet drawer. Buttons, selects, tabs, forms, menus, dialogs, alerts, tables, progress, tooltips, scroll areas and toasts use the shared component source in `ui/src/components/ui/`. The custom screenshot canvas and accessibility selection sit inside those components. Light, dark and system appearance are available from the sidebar footer. Cmd/Ctrl+K searches projects; Cmd/Ctrl+B toggles the sidebar.

```sh
npm ci
npm run build
./sync.sh /path/to/app
```

Edit `ui/src/`, then build before syncing. The reproducible Vite build writes a self-contained browser bundle and stylesheet into `studio/assets/` and generates `studio/index.html`. React and the component dependencies are bundled locally; app repositories need only Node to run the existing server, without npm installation or a CDN connection. Opening the HTML file directly still shows a shadcn launch screen. Renderer files such as `preview.html`, `core.js`, `gallery.js` and `studio.css` remain separate from the interface bundle, so each app retains its own artwork.

`components.json` records the shadcn registry setup. Component source is owned here and may be tailored; the slider forwards its accessible name to the actual thumb. The shadcn MIT notice is in `ui/SHADCN-LICENSE.md` and is included with the generated bundle.

## Project workspace

Start the shared workspace from this master folder:

```sh
node studio/server.cjs 8790
```

Open `http://127.0.0.1:8790/studio/`. The sidebar lists every connected project, with **Overview**, **Cards**, **Languages** and **Copy** beneath Studio apps. **All projects** shows real artwork, gallery and card counts, language readiness, capture coverage and export counts. Each project overview includes a language-by-language table and links to its device galleries. Navigation updates the current document while the sidebar stays mounted, with browser Back/Forward support. Repeated view clicks keep the current artwork; returning to a recently used view reuses its loaded previews. New live previews show an available export while they load.

**Add project** accepts an app folder or screenshot folder. On macOS, **Choose folder** opens the native folder chooser; you can also paste a path. **Find projects** searches a parent folder, then lets you select which results to connect. The search visits up to four folder levels and 2,000 directories, skipping hidden, build and dependency folders. Projects with `store-listing/studio.json` use the editor. Other folders become image libraries: Studio scans common screenshot directories (or the selected folder), up to five levels and 2,000 images. It does not generate an app configuration or move your files.

The project registry lives at `~/.screenshot-studio/projects.json`, shared by app servers and the master server. Registration persists across restarts. Use `--registry /path/projects.json` or `SCREENSHOT_STUDIO_PROJECTS` for a separate workspace; repeat `--add /path/to/app` to register folders from the command line. Starting the server inside an app automatically connects that app. Change its name or folder from the project menu. Removing a project only removes its registration; all project files stay in place. Unavailable folders remain visible so they can be reconnected.

Coverage counts saved files used by the current gallery, including inherited cards. A **complete asset set** has all reference copy fields filled, all required captures and layout maps, and all expected exports present for that language. It does not certify freshness or a strict export result; run the exporter and review the artwork before publishing. Draft or borrowed English captures do not count as localized captures.

Unsaved copy is retained per project and language in this browser tab’s session storage, including across project switches and reloads. Save writes only to that project’s selected language. If the saved file changed elsewhere, the editor asks you to keep your draft or use the saved copy. Session storage is temporary; use **Save copy** before closing your browser session.

## What an app provides

```
store-listing/
  studio/           synced from here, do not edit
  studio.json       {"app": "Name", "locales": ["en-US"], "defaultLocale": "en-US", "writeAssets": true, "supersample": 2, "contactSheets": {"phone": "..."}} (supersample renders at 2× and downsamples, for crisp rotated or scaled UI)
  profiles.json     per gallery: width, height (export canvas), captureWidth, captureHeight, captureDensity, frame ("phone" | "tablet" | "browser" | "none"), label
  theme.css         the app's type, colors, device placement per kind (.phone, .tablet7, .tablet10, .desktop; .portrait/.landscape)
  theme.js          export default { art, compose, layout, decorate } (all optional, see below)
  gallery.json      shared layout: captures, callouts, order, output names; tablets may inherit phone cards
  <locale>/copy.json per-card words keyed by feature, with optional "kind/feature" overrides
  <locale>/raw/           native captures and matching <name>.nodes.json UI layout sidecars
```

A card:

```json
{"feature": "price", "raw": "phone/light/02-compare.png", "callouts": [{"x": 163, "y": 908, "w": 880, "h": 176, "mag": 1.16, "radius": 24}], "file": "optional/output/name.jpg", "vars": {"--paper": "#fff"}}
```

Several devices on one card: `"devices": [{"raw": "...", "role": "primary"}, {"raw": "...", "role": "secondary", "frame": "phone"}]` (each gets its role as a class). A card with no `raw` or `devices` is art only (a theme-drawn icon, for example). `"frame": "none"` shows a capture as the whole image. A `file` ending in `.png` is written as PNG; add `"transparent": true` for a 32-bit PNG such as an app icon. A gallery written as `{"inherits": "phone", "cards": [...]}` merges each card over the phone card at the same position, so tablets can swap captures and layout while using the same feature copy. Feature graphics and icons are just more galleries with their own profile. README strips join a run of real store cards edge to edge, the way the store carousel shows them: list them in studio.json as `"readmeStrips": [{"file": "readme/strip-1.jpg", "kind": "phone", "cards": [0, 1, 2, 3], "height": 1200}]` (card indexes, default locale only; run alone with `--kind strips`). Each card renders with `html[data-strip]` set to first, middle, last or only, so a theme can hide art that sits on the strip's outer seams. README art works the same way: give its profile `"defaultLocaleOnly": true` so it renders once, in the default locale, and give a device `"label": "Before"` (with optional `*highlight*`) for a caption centred above its frame (`.device-label` holding a `span`, plus the device's role as a class, for the theme to style). A before/after pair can show an older app's screenshot from any file in `<locale>/raw/`, as long as it keeps a phone's ratio.

Headline markup: `*highlight*` → `<em>`, `~old~` → `<del>`, `[new]` → `<ins>`, `\n` breaks the line; the theme decides how each looks. Callouts lift a region of the real capture (capture pixels) out of the screen, centred where it lives (`dx`/`dy` move it). A callout can also come from another capture of the same scene with `"raw"` (a notification shade, say), placed with `"place": {"left", "top", "width"}` in canvas pixels; `"role"` adds a class so the theme can style it. Any extra fields on a card are available to the theme as `ctx.slide`.

`theme.js` hooks run in order with `ctx = {W, H, kind, locale, index, slide, slides, profile, profiles, config, main, art, capture}`: `art(ctx)` returns SVG for the background layer; `compose(ctx)` adds DOM (brand, notes, drawn details) before images and fonts settle; `layout(ctx)` adjusts frames once captures have their size; `decorate(ctx)` runs last with `ctx.devices` (each with `box` and `screen` relative to the canvas; `ctx.device`/`ctx.screen` are the first) and may throw to fail an export. `studio/shapes.js` has shared helpers: panorama coordinates and gradients (so art continues exactly across card seams), color mixing, and Material 3 Expressive shapes. Mark anything that must stay on the canvas with `data-check-bounds`.

## App icons

`studio/icon.cjs` is the icon factory: an app draws its icon once and gets every icon it ships. Draw it as SVG layers on Android's 108 x 108 adaptive canvas in `store-listing/brand/`: `background.svg` (full bleed), `foreground.svg` (the mark on transparent, inside the 66-wide safe circle at the centre) and, for Android's themed icons, `monochrome.svg` (the mark in one colour). A layer can embed painted art (`<image href="foreground.png">` beside it is inlined), and an existing Android vector drawable becomes a layer as is with `node store-listing/studio/icon.cjs --import drawable.xml > store-listing/brand/foreground.svg`. `brand/icon.json` lists where icons go, from the repository root:

```json
{
  "android": {"res": "app/src/main/res", "legacy": true},
  "files": [
    {"path": "store-listing/brand/icon.png", "size": 512, "shape": "square"},
    {"path": "web/favicon.svg", "shape": "circle"},
    {"path": "desktop/AppIcon.ico", "shape": "rounded"},
    {"path": "desktop/AppIcon.icns", "shape": "rounded"},
    {"path": "ios/AppIcon.icon", "apple": {"Background": "background", "Mark": "foreground"}},
    {"path": "ios/Assets.xcassets/AppIcon.appiconset/icon-1024.png", "size": 1024, "shape": "square", "scale": 1.3, "opaque": true}
  ]
}
```

Run `PLAYWRIGHT_MODULE=… node store-listing/studio/icon.cjs`. Android gets adaptive icons from bitmap layers at every density, `name` and `type` (`mipmap` or `drawable`) matching the manifest, plus `ic_launcher`/`ic_launcher_round` PNGs for old launchers with `"legacy": true`. Each file is a PNG of its size, or vector for `.svg`, a multi-size `.ico`, an `.icns` (macOS) or an Apple Icon Composer `.icon`: its `apple` map writes each named layer to `Assets/<Name>.png` at 1024px so iOS can light glass layers separately (extra layers such as `brand/corners.svg` work too), keeps an existing `icon.json` with its tuned glass, dark and tinted settings, and is checked with Xcode's `ictool`. Shapes are `square` (stores mask their own), `rounded`, `circle` and `mark` (the foreground alone); `{"layer": "corners"}` draws one layer alone; `scale` grows or shrinks the mark on its ground (an Apple icon shows the whole square); `opaque` drops transparency (Apple's App Store icon).

Several icons (widget or shortcut icons, a build flavour's icon) are listed as `{"icons": [{"layers": "todo", "android": {...}, "files": [...]}, ...]}`, each drawn in `brand/<layers>/`. A layer missing there comes from `brand/` itself, so a variant redraws only what changes (an alpha build's lavender ground, say); `"monochrome": false` leaves out the themed layer. Every run writes `icon-preview.png` beside the layers: the icon in each shape, at launcher sizes on light and dark, and themed.

## Capture on the emulator

`studio/capture.py` is the emulator side of every app (Python 3; Pillow for writing images). An app keeps only its scene tour in `store-listing/capture-emulator.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'studio'))
from capture import Device, parser

args = parser(__doc__).parse_args()            # --serial (default emulator-5578), --profile, --locale, --only
with Device(args, 'com.example.storecapture', '.MainActivity') as d:
    for profile in d.profiles():               # every profiles.json entry with captureWidth/Height/Density
        d.night(False)
        d.launch(clear=True)                   # force-stop, clear data, set the app language again, start
        d.shot('01-home')                      # <locale>/raw/<profile>/01-home.png + 01-home.nodes.json
        d.tap('Settings')                      # by label: a regular expression over text or description
        d.shot('02-settings')
```

`Device` works only on an emulator serial and refuses to start while a `wm size`/`wm density` override is left over (`python3 store-listing/studio/capture.py reset` clears one). While open it sets gesture navigation, System UI demo mode (9:41, `battery` level, full Wi-Fi, no mobile signal, SIM or notifications), font scale 1, heads-up off, other apps' notifications snoozed, Wi-Fi and data off (`offline=False` keeps them), animations off (`animations=False`) and the app language; each profile gets its display size and density. On exit, even after a failure, it restores all of it. It also recovers from what goes wrong on a busy emulator: a stale UiAutomation client (agent-device's `snapshothelper` app_process, "UiAutomationService already registered") is stopped, an "isn't responding" dialog gets Wait, a slow first draw is waited for, and `install()` answers INSUFFICIENT_STORAGE by uninstalling the capture build and trimming caches before installing again. Helper packages that would show up in app lists (`com.callstack.agentdevice.*`, SafetyCore, contact keys, verifiers) are removed for the user with `pm uninstall --user 0`.

The rest of the toolkit: `tap(label, wait, text_only=, within=lambda bounds: …, key=)`, `find`, `present`, `wait_for`, `back`, `key`, `type`, `swipe`, `scroll(fraction, up=)`, `drag(pixels)`, `scroll_to(label, top)`, `launch(activity, clear, **intent extras)`, `set_clock('09:41')` (host time comes back on exit), `rotate`, `use(profile, w, h, dpi)` for sizes outside profiles.json, and `shell`/`adb`. `shot(*targets, animated=, check=, either=)` checks the screen (the app in front, no system dialog, the expected size), strips the second display's warning from `screencap`, and writes each target: a plain name goes to `<locale>/raw/<profile>/<name>.png`, a relative path under `<locale>/raw/`, a `Path` anywhere; `.jpg` targets are JPEG, and files under `raw/` get their `.nodes.json` sidecar. `--only a,b` skips other shots. With the default tap map the reference locale records each tapped node's tree path in `<default>/raw/tap-map.json` and other locales replay them, so a tour written with English labels runs in every language; `d.scope` (default `<profile>|<theme>`) keys the taps.

`studio/recapture.cjs` is the one command for every app: `node store-listing/studio/recapture.cjs [locale…] [--profile phone] [--no-build] [--no-capture] [--no-export] [--dry-run]`. It reads a `capture` block in studio.json:

```json
"capture": {
  "build": "./gradlew :app:assembleStoreCapture -q",
  "install": [{"apk": "app/build/outputs/apk/storeCapture/app-storeCapture.apk", "package": "com.example.storecapture"}],
  "runs": [{"args": ["--theme", "light"]}, {"args": ["--theme", "dark"], "profiles": ["phone"], "locales": "default"}],
  "retries": 2,
  "export": "optional per-locale command with {locale}, instead of studio/export.cjs",
  "after": ["python3 scripts/refresh_readme_assets.py"]
}
```

It builds, installs through `capture.py install` (with the storage recovery), then for each locale (the default first, since it records the tap map) runs each run's `script` (default `store-listing/capture-emulator.py`) once per profile with `--serial --locale --profile` and the run's `args` (`${NAME}` reads the environment), through `uv run --with pillow` when uv is installed. A failed run resets the emulator and is tried again. `locales` is `"all"` (default), `"default"` or a list; `profiles` defaults to every capture profile (`false` passes none). Then it exports each locale and runs `after`. Use only the one capture emulator (`CAPTURE_SERIAL`, default `emulator-5578`), one capture job at a time.

## Rules every gallery follows

- Real app captures only, with the real status bar and navigation; no painted system UI. Sample data is local and fictional.
- Every capture keeps a real device ratio (a configured capture size, either orientation); the renderer fails otherwise.
- Devices are large (about two thirds of the card) and may run off an edge; copy and callouts never leave the canvas or cover the app.
- The set reads as one strip in the store carousel: background and art are laid out in panorama coordinates.
- Short benefit headlines with one marked phrase, one supporting line.

## Use

```sh
node store-listing/studio/server.cjs 8790      # editor at /store-listing/studio/
node store-listing/studio/export.cjs --locale en-US  # --kind phone limits a gallery
node store-listing/studio/locales.cjs                  # translation/capture/layout coverage
node store-listing/studio/locales.cjs --init de-DE     # scaffold empty copy, register locale
node store-listing/studio/export.cjs --locale de-DE --strict
```

The editor shows each device gallery live from the source files, joined edge to edge or spaced like the store, and can switch to the exported JPEGs. The exporter serves the repository itself (themes may load fonts from anywhere in it), writes `<locale>/<kind>/NN-feature.jpg` unless a card sets `file`, a contact sheet per device, and `<locale>/assets.json`. It fails when fonts don't load (cards with copy), a capture has the wrong ratio, copy or callouts leave the canvas, a headline overflows, copy overlaps the app, or any request fails.

## Languages and capture layouts

Layout is shared in `gallery.json`. Words live in `<locale>/copy.json`, for example:

```json
{"price": {"title": "~$1,599~ [$1,349]", "body": "Catch the price drop."},
 "tablet10/price": {"title": "See the [price drop]"}}
```

Empty or absent translated fields use the default locale's words and get an untranslated warning. A missing localized capture uses the default capture and gets a borrowed-capture warning. Draft languages are deliberately empty, rather than filled with English that would incorrectly count as translated. `locales.cjs --init` preserves existing translations. Sample content (room names, networks, example pages and calculations) stays English.

Headlines shrink with the supporting text until they fit, to a minimum of 72% by default (`minFit` in `studio.json`). Shorten copy when the exporter still rejects it. The studio selects script font fallbacks for Japanese, Korean, Chinese, Hindi and Bengali; app CSS can override them with app-specific fonts.

Fictional apps for app lists: `studio/fixture-apps.cjs <spec.json> [--install <emulator>]` builds code-free stub APKs (label, adaptive icon from a Lucide glyph or text, INTERNET permission, category) with the SDK's `aapt2`/`apksigner` and Playwright, cached in `.fixture-apps/` beside the spec.

Capture the reference language first (`recapture.cjs` does). `studio/capture.py` handles languages, tap replay and sidecars for a scene tour; underneath, `studio/uitree.py` provides `set_app_locale` (Android 13+ per-app language, checked by readback), `Navigator` (record English taps and replay UI tree positions), and `write_sidecar`. Save layout files next to each image as `scene.nodes.json`: `{"width":1080,"height":2340,"nodes":[{"path":"0.1","b":[40,200,1040,380],"text":"..."}]}`. Paths must be stable between locales; bounds are capture pixels. Kotlin instrumentation may write the same format directly from Android accessibility nodes. The reference sidecar anchors a callout to a UI element; localized bounds move and resize the callout. A missing match keeps the reference position and is flagged for review.

The exporter prints a per-language summary of untranslated cards, borrowed captures, relocated callouts, callouts that could not follow their element, and fitted copy. `--strict` fails on untranslated words, borrowed captures and unresolved callouts for a translated locale. Successfully relocated callouts are valid. Without `--locale`, every configured language is exported, including drafts; use a locale filter while translating.

## Editor

**Cards** shows one language and device, with live previews, warnings, an exported-image toggle, and a callout picker. **Languages** shows searchable coverage rows with All languages, Needs copy and Copy complete filters. Expand Preview to mount that language’s selected gallery; collapsed rows do not load artwork. Copy counts include every gallery, while captures and exports use saved project files. Continue translation opens the first incomplete language. **Copy** shows reference words beside editable fields; save writes the selected language's `copy.json`. Cmd/Ctrl+Enter saves; saving refreshes the preview. Search by card or phrase, filter missing fields, or jump to a card without losing drafts. English reference editing uses one column; translated fields retain their reference beside them. Fields show character counts and explicit fallback status. The mobile Preview button opens the saved artwork in a dialog; it does not save automatically. Empty fields visibly warn and preview their English fallback.

Pick a callout by dragging on the reference capture. Coordinates are saved in capture pixels to `gallery.json`; localized cards follow through their sidecars. The picker can select a device on a multi-device card, change magnification and radius, copy JSON, save, or remove callouts. Check each localized callout visually even when its tree path matched.

The v4 editor uses a shadcn workbench with persistent Sidebar navigation, light/dark appearance, a dedicated preview canvas, copy-completion indicators in Languages, and grouped copy fields beside a sticky live preview. Unsaved copy stays in the browser tab while switching views or projects; button or Cmd/Ctrl+Enter saves it. Preview zoom and Joined update the existing artwork without reloading it. The gallery has Previous/Next controls and a visible card range, with reduced-motion support. The callout dialog also supports precise keyboard-entered coordinates and preserves existing placement settings.

**Element** mode loads the accessibility tree saved with the reference capture. Hover and click on the screenshot, or search the element list by text, accessibility label, resource ID or path. **Parent element** selects the enclosing control. The selected rectangle snaps to the node's exact capture-pixel bounds. **Draw box** remains available for custom crops, merged nodes and canvas content. A missing tree or capture-size mismatch disables snapping.

Element selections save `target`, `targetMode: "element"`, the node class, and a unique resource ID when available. Rendering resolves the exact node bounds again, including in the reference language after recapture. A unique ID survives path changes; otherwise matching uses path and class. Missing, ambiguous or incompatible targets are flagged in translated previews and rejected by strict export. A missing reference target fails rendering rather than silently using an old box. Path-based matches still need visual review when a UI changes; accessibility bounds can include hit-area padding or merged content.

Opening `studio/index.html` directly shows the launch screen. Use the local HTTP server from an app repository to load captures, render artwork and save edits.

Latest verification: [Capture and editor validation](VALIDATION.md).

## Image gallery dialog

Click artwork in the workspace overview, project filmstrip, screenshot library, Cards, Languages previews or Copy preview to open the shared shadcn gallery. Its dark presentation, wrapping navigation and thumbnail strip follow the gallery interaction in the local Kotlin Reforge project. Images stay in the studio; opening an original file in a new tab is an explicit toolbar action.

Use the arrows, thumbnails, keyboard Left/Right or a horizontal swipe to change images. Home/End jump to the first/last item. Zoom buttons, double-click and trackpad/pinch gestures enlarge the artwork; drag to pan while enlarged. **Fit** (or `0`) resets the image, and **1:1** shows its native size. Original images can be downloaded; live artwork opens the current locale/device renderer instead of showing an unrelated export. Draft warnings remain visible. The copy viewer explains when unsaved words are not included, and never saves automatically.

Escape closes the gallery and returns focus to the image trigger. Tooltips do not consume the close action. Missing images show a retry action; when an artwork item has a live renderer, it offers a live-preview fallback. The accessibility callout canvas keeps its element-selection interaction.

## Verification

```sh
npm test
# Install Chromium once if Playwright has no browser available:
npx playwright install chromium
npm run test:ui
```

The browser suite uses temporary project fixtures and a separate registry. It checks the real shadcn Sidebar and mobile Sheet, retained previews, Back/Forward, custom selects and keyboard saves, copy conflicts, project discovery/settings/removal, exact accessibility-element callouts and localized geometry, manual selection, dark appearance, command search and the file launch screen. Build first after changing source.

## Workspace appearance

Studio v4.2 uses the neutral shadcn theme across the workspace, project summaries, language screens and editor controls. Project filters use shadcn Tabs with connected panels, arrow-key navigation and project counts. Project cards show screenshot previews, gallery metadata and language completion without repeating the full overview. Headers and card grids respond to the available content width beside the sidebar; filters stay visible on small screens. The project language table aligns numeric columns for comparison.

The palette declaration audit and design decisions are recorded in [DESIGN-NOTES.md](DESIGN-NOTES.md).

## Project sections

Studio v4.3 gives each project separate Overview, Galleries and Languages tabs. The selected section stays in the URL for reloads, links and browser history. Overview highlights the next unfinished language and links directly to its copy or artwork. Galleries lists each device or store asset size. Languages supports search and asset-status filtering, with a full table on wide screens and cards with all counts and actions on narrow screens.

The workbench uses a shadcn Select for device galleries when there is not enough room for the tab strip. Translation fields stack their reference above the input on narrow layouts, and shortcut hints follow the platform. Navigation tabs activate on click, Enter or Space so focusing a route tab does not create duplicate history entries.
