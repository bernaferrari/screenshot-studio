# The editor

A local web app for every project you connect.

```sh
node studio/server.cjs 8790                      # from this repository: the whole workspace
node store-listing/studio/server.cjs 8790        # from an app: that app, connected automatically
```

Open `http://127.0.0.1:8790/studio/` (or `/store-listing/studio/` inside an app). Nothing leaves your computer.

<p align="center">
  <img src="images/editor-projects.jpg" width="100%" alt="The workspace: seven connected projects with their cards, language progress and capture counts">
</p>

## Projects

**All projects** shows every connected project with its cards, language progress and capture coverage. A listing opens in its editor; a folder of screenshots without one opens as an image library.

**Add project** takes an app folder (or a folder of screenshots, which becomes an image library) by path or with the folder chooser on macOS. **Find projects** searches a parent folder and lets you pick what to connect. Removing a project only forgets it; its files stay.

The project list lives in `~/.screenshot-studio/projects.json`, shared by every studio server. Use `--registry /path/projects.json` (or `SCREENSHOT_STUDIO_PROJECTS`) for a separate list, and `--add /path/to/app` to connect folders from the command line.

Each project's header has its numbers at a glance: cards and galleries, languages with a complete asset set, captures and exports present (and when the last export ran), and how much is left to fix. A language's **complete asset set** means its copy is filled in and its captures, layout maps and exports are all present. It doesn't mean they're fresh or pass a strict export. Below the header are the project's three sections: **Gallery**, **Languages** and **Review**.

**Live.** The editor follows the project's files. When `theme.css`, `theme.js`, `gallery.json`, a `copy.json` or a capture changes on disk (you saved in your editor, an agent rewrote the theme, a recapture finished), the affected previews render again in place: the new render loads behind the old one and replaces it when it's ready, so scroll position and zoom stay put. The **Live** badge in the header says whether the editor is following.

<p align="center">
  <img src="images/editor-cards.jpg" width="100%" alt="SDK Monitor's phone cards in the editor">
</p>

## Gallery

One gallery in one language, live from the source files or as exported. **Joined** shows the cards edge to edge, as the store carousel does. Zoom and paging don't reload the artwork.

**Inspect a card** by clicking it. The inspector shows the card's words in the current language, editable beside the reference (**Save words** or Cmd/Ctrl+Enter writes that language's `copy.json`), what the live render and the last export noticed about it, its captures and callouts, its layout words and output file, and its `gallery.json` entry. ← and → move between cards, Esc closes it. **Open in viewer** shows the card full size.

**Store preview** shows the gallery as a Google Play store page: the app's icon and name, the cards at the store's thumbnail size on a phone-width page (tablet galleries on a tablet-width one), and the short description from `<locale>/listing.json`. Judge legibility here: if a headline is hard to read at this size, it's hard to read in the store.

**Callouts.** Pick a callout by dragging over the reference capture, or switch to **Element** to pick a UI element from the capture's layout map: hover or search by text, label, resource ID or path, and **Parent element** to widen the pick. An element callout snaps to the element's exact bounds and follows it into every language; a missing or ambiguous element is flagged and fails a strict export. Set magnification and corner radius, type exact coordinates, copy the JSON, or save it to `gallery.json`. Check localized callouts by eye even when they matched.

## Languages

Every language with what it still needs: copy fields (unsaved words included), captures, layout maps and exports. Filter to **Needs work** or **Complete**, or search. **Continue translation** opens the first unfinished language.

**Edit copy** opens a language's words: the reference beside editable fields, with character counts and a visible note wherever a field falls back to the reference, and the saved card previewed alongside. Search by card or phrase, or filter to missing fields. **Save copy** (or Cmd/Ctrl+Enter) writes that language's `copy.json`. Unsaved words are kept in the browser tab across views, projects and reloads; if the file changes on disk under them, you choose which to keep.

## Review

Everything to fix, in one list: the file check (`npx screenshot-studio check`) and what the last export noticed (copy left untranslated or shrunk, borrowed captures, callouts that didn't follow their element, backgrounds that break between cards, stale files, store text over Play's limits). Each issue shows its file and location, the message and what to do about it, and **Open card** takes you to the card it concerns, inspector open. The review runs again whenever files change. `export` writes `export-report.json` beside `gallery.json` for it.

## Shortcuts

| Keys | Does |
|---|---|
| Cmd/Ctrl+K | Search projects |
| Cmd/Ctrl+B | Toggle the sidebar |
| Cmd/Ctrl+Enter | Save copy, or a card's words in the inspector |
| ← → , Esc | Move between inspected cards, close the inspector |
| ← → , Home, End | Move through the image viewer |
| 0, double-click, pinch | Fit or zoom in the image viewer |
| Esc | Close the viewer |
