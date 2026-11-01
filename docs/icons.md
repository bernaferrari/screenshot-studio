# App icons

Draw an app's icon once and `npx screenshot-studio icons` writes every icon it ships: Android adaptive and themed icons at every density, store icons, favicons, desktop icons and Apple icons.

```sh
npx screenshot-studio icons                     # reads store-listing/brand/icon.json
npx screenshot-studio icons path/to/icon.json   # another icon list
```

## The layers

Draw SVG layers on Android's 108 × 108 adaptive canvas, in `store-listing/brand/`:

| File | What |
|---|---|
| `background.svg` | The full-bleed ground |
| `foreground.svg` | The mark on transparent, inside the 66-wide safe circle at the centre |
| `monochrome.svg` | The mark in one colour, for Android's themed icons (optional) |

A layer can embed painted art: an `<image href="foreground.png">` beside it is inlined. An existing Android vector drawable becomes a layer as is:

```sh
npx screenshot-studio icons --import drawable.xml > store-listing/brand/foreground.svg
```

## Where icons go

`brand/icon.json`, with paths from the repository root:

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

**Android** gets adaptive icons from bitmap layers at every density (with a themed layer when `monochrome.svg` exists), and with `"legacy": true`, `ic_launcher` and `ic_launcher_round` PNGs for old launchers. `name` and `type` (`mipmap` or `drawable`) match the manifest.

**Files** are written by extension:

| Extension | Output |
|---|---|
| `.png` | A PNG of `size` |
| `.svg` | Vector |
| `.ico` | Multi-size, 16–256 px |
| `.icns` | macOS, built with `iconutil` |
| `.icon` | Apple Icon Composer: each layer in `apple` becomes `Assets/<Name>.png` at 1024 px, so iOS can light glass layers separately; an existing `icon.json` with tuned glass, dark and tinted settings is kept; checked with Xcode's `ictool` |

| Option | Effect |
|---|---|
| `shape` | `square` (stores mask their own), `rounded`, `circle`, or `mark` (the foreground alone) |
| `layer` | Draw one extra layer alone, e.g. `{"layer": "corners"}` for `brand/corners.svg` |
| `scale` | Grow or shrink the mark on its ground (an Apple icon shows the whole square) |
| `opaque` | No transparency (Apple's App Store icon) |

## Several icons

Widget or shortcut icons, or a build flavour's icon, are listed as `{"icons": [{"layers": "todo", "android": {...}, "files": [...]}]}`, each drawn in `brand/<layers>/`. A layer missing there comes from `brand/`, so a variant redraws only what changes. `"monochrome": false` leaves out the themed layer.

Every run writes `icon-preview.png` beside the layers: the icon in each shape, at launcher sizes on light and dark, and themed.
