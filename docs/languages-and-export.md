# Languages and export

## Words per language

Layout is shared in `gallery.json`; words live in `<locale>/copy.json`, keyed by each card's `feature`:

```json
{"price": {"title": "~$1,599~ [$1,349]", "body": "Catch the price drop."},
 "tablet10/price": {"title": "See the [price drop]"}}
```

A `kind/feature` key overrides one gallery. An empty or missing field falls back to the default language's words, with an *untranslated* warning; a missing capture falls back to the default capture, with a *borrowed capture* warning. Draft languages stay empty rather than filled with English, so they never count as translated. Sample content (names, places, example pages) stays in English.

```sh
npx screenshot-studio locales                # coverage: words, captures, layout maps
npx screenshot-studio locales --init de-DE   # add a language with empty copy
```

Headlines shrink to fit, down to 72% of their size by default (`minFit` in `studio.json`); past that, shorten the copy. Japanese, Korean, Chinese, Hindi and Bengali get script font fallbacks automatically; a theme can set its own.

Store text (title, short and full description) lives in `<locale>/listing.json`.

## Export

```sh
npx screenshot-studio export                          # every language
npx screenshot-studio export --locale en-US           # one language
npx screenshot-studio export --kind phone             # one gallery
npx screenshot-studio export --kind phone --card 0    # one card (0-based), to look at while editing
npx screenshot-studio export --locale de-DE --strict
npx screenshot-studio export --fastlane               # also fastlane / F-Droid metadata
npx screenshot-studio export --json                   # the result as JSON, for tools and agents
```

It writes `<locale>/<gallery>/NN-feature.jpg` (or each card's `file`), a contact sheet per gallery (`<locale>/contact-phone.jpg`: the whole strip, to judge as a set), and `<locale>/assets.json`, then prints a summary per language: untranslated cards, borrowed captures, moved and unresolved callouts, and copy that was shrunk to fit.

| Option | Does |
|---|---|
| `--locale`, `--kind`, `--card` | Only that language, gallery or card; `--card` takes the card's 0-based index, with `--kind` |
| `--strict` | Warnings fail the export |
| `--prune` | Deletes images no card writes any more, instead of warning about them |
| `--fastlane` | Writes fastlane metadata (below) |
| `--json` | Prints every file written, each card's notes, the warnings and the per-language tally as JSON |

Every export also writes `export-report.json` beside `gallery.json`: the same result, with when it finished and which options it ran with. The editor's Review reads it.

**It fails when:**
- a font doesn't load on a card with copy;
- a capture isn't a real device ratio;
- copy doesn't fit even at `minFit`, copy or a callout leaves the canvas, or copy covers the app;
- a device frame breaks its bounds (see [Setting up an app](setup.md));
- any request fails.

**It warns, and `--strict` fails, when:**
- a headline line or supporting line leaves one or two words on a short last line (under a third of the longest line): reword or shorten it, since it reads as a mistake at thumbnail size;
- a gallery folder holds images no card writes any more (delete them, or export with `--prune`);
- a continuous background breaks between cards;
- `listing.json` is over Play's limits: title 30, short description 80, full description 4,000 characters;
- with `--strict`: untranslated words, borrowed captures or unresolved callouts in a translated language.

Run `npx screenshot-studio check` first: it finds file mistakes in a second, without rendering. Review the artwork before publishing; passing checks don't make a card good.

## README strips

A run of real store cards joined edge to edge, the way the store carousel shows them:

```json
"readmeStrips": [{"file": "readme/strip-1.jpg", "kind": "phone", "cards": [0, 1, 2, 3], "height": 1200}]
```

Each card renders with `html[data-strip]` set to `first`, `middle`, `last` or `only`, so a theme can hide art at the strip's outer edges. Render them alone with `--kind strips`.

## fastlane and F-Droid

`--fastlane` writes `fastlane/metadata/android/<locale>/{title,short_description,full_description}.txt` from each language's `listing.json`, and the phone cards as lossless `images/phoneScreenshots/1.png, 2.png…` (the folder is replaced only when the export succeeds):

```json
"fastlane": {
  "dir": "fastlane/metadata/android",
  "screenshots": {"phone": "phoneScreenshots", "tablet7": "images/sevenInchScreenshots"},
  "screenshotLocales": ["en-US"],
  "locales": {"ru-RU": "ru"}
}
```

`screenshotLocales` may be `"all"`; `locales` maps a studio language to fastlane's name for it.
