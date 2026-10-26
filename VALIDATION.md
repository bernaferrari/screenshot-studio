# Studio v3.1 validation — 26 October 2026

The capture/localization workflow is implemented and synced into WiFi Weakspot, ChangeDetection and Calcula. English is complete in all three apps. WiFi German is complete across phone, both tablets and desktop. The other 23 app/language combinations remain translation drafts, as requested; German phone captures are also available as capture-flow checks in ChangeDetection and Calcula.

## Completed exports

| App | Locale | Copy fields | Gallery capture sources | Layout sidecars | Export result |
| --- | --- | --- | --- | --- | --- |
| WiFi Weakspot | en-US | 18/18 | 21/21 | 21/21 | 21 cards, strict pass |
| WiFi Weakspot | de-DE | 18/18 | 21/21 | 21/21 | 21 cards, strict pass |
| ChangeDetection | en-US | 17/17 | 14/14 | 14/14 | 14 cards, strict pass |
| Calcula | en-US | 35/35 | 24/24 | 24/24 | 21 assets, render and validation pass |

All completed sets have zero untranslated fields, borrowed captures and unresolved callouts. WiFi German follows all five phone callouts; five of its 21 cards shrink their copy to fit, within the 72% minimum. Sample room/network names, calculation notes and example page contents were retained.

## Capture checks

Only `StudioCapture`, serial `emulator-5566`, was operated on. No commands operated on the phone or `emulator-5554`.

- Android per-app language selection is verified by readback before capturing. Actual German UI text was checked in all three apps.
- WiFi: all 17 native gallery sources in English and German, four browser sources per language, and layout sidecars for every source. English tap maps cover both store themes, all profiles, the moving-history flow and desktop. The moving-history helper captured the example walk on all three Android profiles in both languages. Capture/image/layout hashes were cataloged for both locales.
- ChangeDetection: all three profiles in both themes passed the capture instrumentation test in English; both German phone themes passed too. Full runs save 34 English and 12 German PNGs with accessibility layout files. The active gallery uses 14 English sources. Screenshot dimensions and nonempty matching layouts are checked when pulling them.
- Calcula: 25 English scene captures, including alternate orientations and desktop, plus seven German phone scenes. Capture manifests record locale, dimensions, APK and image hashes. All 24 sources used by the English gallery have sidecars.
- Display size/density overrides and System UI demo mode were reset. All three capture packages have empty per-app locale overrides after cleanup.

ChangeDetection's old home wait expected `1 change`; the current preview exposes Before/After labels. The test now waits on their translated resources and uses the app's own string keys for navigation and controls. Its existing sample-data and wide-screen tours were preserved. An independent temporary Gradle output/cache was used because another build held the checkout's configuration-cache lock.

## Renderer, editor and fallback checks

- **511 live card previews across 27 app/language configurations passed** copy fitting, checked-element bounds, image loading and font error checks. Drafts correctly report missing words and borrowed captures.
- All three editors passed real Chromium checks for button save, Ctrl+Enter save, Languages rows, callout drag/save and visible English fallback from an empty field. Test edits were restored afterward.
- A temporary missing locale was rejected by strict export for untranslated copy and borrowed captures. Its generated assets were removed.
- Chinese, Hindi and Bengali font files supplied by ChangeDetection loaded successfully with native-script sample text.
- Direct helper checks passed for blank/whitespace fallback, gallery inheritance, callout relocation, missing layouts, tap retry numbering, translated-tree replay and locale readback.
- All configured locale copy schemas match their English reference. WiFi's `prepare.py --locale en-US --strict` and `--locale de-DE --strict` pass. Its default check reports the remaining draft gaps without claiming they are translated.
- Calcula's `render.mjs --validate --locale en-US` passes all 21 assets and listing-copy limits.
- All three `sync.sh --check` calls pass at v3.1. Runtime Python caches are excluded from drift checks and sync.

Empty fields previously overwrote English fallback with blank text; this is fixed. Borrowed images previously retained the requested locale internally, which could relocate a callout against the wrong language; they now retain the actual source locale. Failed navigation lookups no longer advance the recorded tap sequence.

## Visual checks

WiFi's German desktop, coverage and moving-history artwork were reviewed. The coverage legend's callout follows its wider labels:

| Callout | English capture box (x, y, w, h) | German capture box |
| --- | --- | --- |
| Channels | 40, 1418, 514, 118 | 40, 1418, 511, 118 |
| Coverage legend | 576, 290, 443, 82 | 544, 290, 475, 82 |

The remaining three German callouts match their corresponding room, router-results and palette elements without requiring a geometric change.

ChangeDetection's price callout was reviewed and corrected to the current After-image bounds `(58, 900, 964, 169)`; the previous box clipped the dollar sign and stock line. The resulting full price/stock region and its text-change callout were reviewed after export.

WiFi's six README images were refreshed from English exports and pass `refresh_readme_assets.py --check`. Master, app and store-listing READMEs document the new layout/copy split, language capture, sidecars, editor and strict export.

No commits, uploads or publication actions were made.


## Studio v3.2 editor redesign — 26 October 2026

The shared editor now uses a light workspace, persistent sidebar, device tabs, a separate preview canvas, language copy-completion rows, and grouped copy fields with a sticky preview and save status. The callout selector is a focused dialog with existing-selection previews, precise numeric coordinates, magnification and radius controls. Opening the master HTML file directly shows launch instructions instead of a failed editor.

The shell is split into `index.html`, `editor.css`, `editor.js`, `editor-picker.js` and `editor-elements.js`. The renderer now supports explicit accessibility-element anchors; existing gallery files and hand-drawn callouts remain compatible. Capture tools and export commands are unchanged. All three app copies are synced at v3.2.

Chromium verification passed in WiFi, ChangeDetection and Calcula: copy save, keyboard save, unsaved draft retention across views, language rows, callout drag/save, and empty-field English fallback. Additional checks passed for live zoom without iframe reload, Joined and Exported modes, missing-export/draft states, editing and removing existing callouts, magnification form validity, keyboard-entered coordinates, multi-device selection, and focus returning to the edited card. Tests restored copy and gallery files afterward.

Cards, Languages, Copy and the standalone launch screen fit a 390-pixel phone viewport without horizontal page overflow. Desktop views were reviewed at 1440 × 1000, including the callout dialog. Secondary text contrast was strengthened; the Copy view's visible shell text passed a computed foreground/background contrast check at 4.5:1. Preview strips are keyboard-focusable and reduced-motion preferences are respected. No images were recaptured or store artwork changed for this redesign.


### Accessibility element selection

The callout picker reads the layout sidecar from the same capture, checks that image and tree dimensions agree, and exposes searchable elements, screenshot hit selection, parent navigation and a container toggle. Element selections save the exact rectangle plus the path, class and unique resource ID where available. The renderer resolves the actual node bounds again for each language and for a recaptured reference image. Hand-drawn selection remains available.

Seven `node --test studio/gallery.test.cjs` cases pass: exact node bounds, stable IDs across path changes, missing/ambiguous IDs, missing targets, class and bounds mismatches, explicit cropped anchors and legacy overlap matching. Browser checks passed for screenshot hit selection, search/Enter without form submission, parent selection, saved metadata, exact English and German rendered geometry, missing localized target reporting, missing trees and mismatched capture sizes. The suggested-channel example selects the recorded 533 × 120 pixel element, rather than approximating it by dragging.

This provides exact geometry for exposed nodes, not a guarantee that every visual object has its own accessibility node. Merged content, canvas drawings and path-based matches after a UI change still require review. Existing approved callout crops are preserved unless a user selects a new element.

The full 511-preview / 27-configuration renderer check passed again after the element-anchor change. UI test cleanup now closes the browser and drains HTTP requests before restoring fixtures; all 23 draft copy files were verified empty afterward. Delayed tree loading preserves a user’s manual selection mode, and the element browser fits the mobile layout.

## Studio v3.3 project workspace — 26 October 2026

A single local server now supports multiple registered projects. The shared sidebar expands each app into Overview, Cards, Languages and Copy. All projects shows real artwork, card/gallery counts, capture coverage, language readiness and exports; a project overview gives per-language copy/capture/layout/export counts and gallery links. Add project accepts a folder path or the macOS folder chooser. Find projects discovers existing Studio listings and screenshot libraries for selective import. Plain folders are browsable image libraries; they are not automatically converted to Studio listings.

WiFi Weakspot, ChangeDetection and Calcula are connected in the local registry. The current overview reports **3 projects, 13 galleries, 56 cards, 27 language sets, 4 complete asset sets and 77 exports**. Complete assets means current expected files exist and copy fields are filled; it does not claim a recent strict export or validate translation quality. Removing a registration preserves its project files, and missing folders can be reconnected.

Unsaved copy is retained per project and locale in session storage across project switches and reloads. Saved coverage remains based on disk files. If a saved file changes outside the editor, the restored draft requires a choice between keeping the draft and using saved copy. Saves remain scoped to the selected project and locale. Registry writes are atomic and serialized between Studio processes; project mounts reject traversal/symlink escapes, cross-origin mutation requests, and writes to shared UI or arbitrary project files.

Validation:

- All **13** automated cases pass with `node --test studio/gallery.test.cjs studio/workspace.test.cjs`. New workspace cases cover registration persistence and canonical-folder deduplication, reconnect conflicts, inherited-gallery coverage, discovery exclusions, image libraries, unavailable folders, concurrent registries, mounted write isolation, read-only shared UI, symlink escape protection, origin/host checks, an injected folder chooser, standalone serving, and draft isolation/conflicts.
- Chromium passed actual Cards and Copy views and project language tables in all three apps. Temporary fixtures passed UI add/discover/import/remove, library image decoding, retained drafts across project navigation and reloads, copy save isolation, and both disk-conflict choices. The native macOS chooser itself was not invoked during automated tests; its HTTP route was checked with an injected selector.
- Desktop overview and 390-pixel phone overview/project navigation were visually checked. Both mobile views have zero horizontal page overflow; coverage tables scroll within their container. Dialogs support keyboard focus and Escape. Decorative avatars are hidden from accessible names.
- All **511 live previews / 27 configurations** passed again after the server refactor, including image/font loading, copy fitting and checked-element bounds. All 23 draft locale files remain empty. Browser save tests used temporary projects and a separate registry; the real app copy/gallery files were not edited.
- All three copies are synced at v3.3. The app store-listing READMEs and master README document project management, registry persistence, scan limits, asset-count semantics and temporary draft storage.

No commits, captures, uploads or publication actions were made for this workspace change.

## Studio v3.3.1 navigation fix — 26 October 2026

Project links previously performed full document navigations, briefly showing the opening screen and rebuilding the sidebar. The editor also replaced live-preview iframes on repeated view clicks. A browser probe reproduced one main-document navigation and a discarded shell from a single project click before the fix.

The shell now remains mounted while a small client-side navigator updates project pages. Back/Forward is supported, repeated view clicks are inert, and recent views retain their iframe nodes. An available export fills the preview frame while fresh artwork loads. View caches are bounded and invalidated after copy or callout saves. File, full-preview, modified-click and new-tab links retain normal browser behavior. Sidebar expansion and scroll position are retained. Each editor captures its app’s base URL, including picker images and accessibility sidecars, so an asynchronous save cannot change its destination after a project switch. Abandoned editor loads are prevented from committing over a newer page.

All 13 gallery/workspace cases pass. The three new portable Chromium regressions in `studio/navigation.browser.cjs` pass: shell/preview identity and Back/Forward; a delayed save during project switching; and an abandoned slow editor load. They use temporary projects and an isolated registry. A separate browser run passed navigation through all three real apps, repeated Cards clicks, Cards→Copy→Cards reuse, history and opening the callout picker: **zero main-document navigations**, a preserved sidebar node, and zero preview reloads for the active Cards view. The prior add/discover/import/remove, copy conflict, draft retention, library preview and mobile tests also pass after the navigation change.

The renderer and gallery artwork are unchanged; the previous 511-preview validation remains applicable. All three app copies are synced at v3.3.1. No UI framework or build step was added. No real app copy, captures or galleries were modified for the navigation tests.

## Studio v3.4 workflow polish — 26 October 2026

Languages now uses compact, searchable coverage rows, copy-completion filters, capture/export counts, and expandable previews. Its initial view mounts **zero artwork iframes**, instead of every locale’s gallery. Expanding a language loads that gallery, and its expansion survives switching preview source or device. Continue translation opens the first locale with missing copy. Full copy coverage and saved asset counts are distinguished in the interface.

Copy now supports phrase/card search, a missing-field filter, and a jump-to-card selector without discarding drafts. English reference editing uses a single input column; translated copy retains its reference column. Fields show character counts and explicit fallback status with accessible descriptions. Search Enter does not submit the form, and Cmd/Ctrl+Enter remains the explicit save shortcut. A narrow-screen Preview dialog shows the last saved artwork, explains unsaved changes, fits its frame inside the dialog, and restores focus on Escape.

Gallery controls now scroll Previous/Next and report the visible card range without rebuilding artwork. Scrolling respects reduced-motion settings. Larger controls and labels, stronger complete-status contrast, a skip link, deliberate keyboard focus, delayed navigation feedback, and distinct error toasts complete the pass. The shell remains mounted during navigation.

All **19** automated gallery/workspace/browser cases pass. New browser coverage checks language search and filters, zero initial previews, progressive preview mounting and source reuse, translation continuation, copy filtering with retained drafts, search-versus-save behavior, card jumping, reference-column removal, keyboard entry, mobile dialog bounds and focus restoration. Temporary fixtures and an isolated registry were used for writes.

All three real app editors passed Cards, Languages and Copy page-width checks at **320, 390, 900, 1024 and 1440 pixels** (45 app/view/width combinations), plus carousel scrolling. No page overflow remains at those widths; gallery strips still scroll within their own containers. The all-project add/discover/import/remove, copy conflict/draft, library preview and mobile navigation browser checks pass. The navigation probe still records zero main-document navigations, a retained sidebar and retained loaded cards. Desktop and phone Languages/Copy screens were visually reviewed. No capture, copy, gallery or renderer artwork was changed by this polish pass.

Master documentation and all three app copies are synced at v3.4. No commits or publication actions were made.

## Studio v4 — shadcn migration — 26 October 2026

The entire editor interface now uses React with official shadcn/ui component source, installed through the shadcn CLI. The main shell uses Sidebar with expandable projects, icon collapse and a mobile Sheet drawer. Common controls use Button, Input, Textarea, Label, Select, Slider, Tabs, Toggle, Checkbox, DropdownMenu, Dialog, AlertDialog, Collapsible, Command, Card, Table, Progress, Tooltip, ScrollArea, Skeleton, Empty, Alert, Breadcrumb and Sonner. The custom capture selection canvas remains app-specific inside a shadcn Dialog. The old imperative editor modules and stylesheet have been removed.

The new shell preserves project registration/discovery, folder selection, library browsing, coverage summaries, copy saves and disk-conflict recovery, draft retention, preview source/size/join controls, retained iframe views, browser history, and callout editing. Callouts save capture-pixel geometry and stable target metadata; German fixture rendering follows the relocated element. Manual drawing removes element pins explicitly. Image/tree validation, parent selection, container filtering, numeric coordinates, magnification, radius and callout removal remain available. A portal-mount timing issue found in testing was fixed by loading from the mounted image node. Static artwork iframes are outside the tab order, allowing dialog Escape handling to stay in the interface. The slider’s accessible name is forwarded to its thumb.

Appearance supports light, dark and system settings. Cmd/Ctrl+K opens project search, and the standard shadcn Sidebar shortcut toggles navigation. The production UI is bundled locally as `studio/assets/studio.js` and `studio.css`, with the shadcn MIT notice. `npm ci && npm run build` rebuilds the interface; the app copies run without npm installation or network assets. The file-based launch screen also uses the same shadcn bundle.

Validation:

- **13 gallery/workspace tests pass**, including exact/ambiguous element matches, project persistence and discovery, inherited coverage, scoped file writes, origin/host rejection, symlink protection, standalone serving and draft conflicts.
- **9 Chromium integration cases pass** against the compiled UI with isolated temporary projects: real Sidebar behavior; document/iframe retention and history; custom Select/Toggle copy filtering, uninterrupted typing, search and keyboard save; late-save isolation; abandoned requests; progressive language previews and source reuse; discovery/import/rename/removal; exact element metadata and localized callout geometry plus manual crops; mobile Sheet, appearance, command search and preview dismissal; and the direct-file launch screen. The combined total is **22** passing cases.
- All three real apps passed Cards, Languages and Copy at **320, 390, 900, 1024 and 1440 pixels** (45 combinations), and All projects passed four widths. No horizontal page overflow was detected. Desktop home, gallery and copy views were reviewed. The renderer remains isolated and unchanged.

All three app copies are synced at v4.0. The project registry still contains WiFi Weakspot, ChangeDetection and Calcula. No app captures, copy or gallery source files were modified by UI tests; all mutating browser checks used temporary fixtures. No commits or publishing actions were made.

## Studio v4.1 — shared screenshot viewer — 26 October 2026

The image interaction was checked against `/Users/bernardoferrari/Documents/typescript/kotlin-reforge/components/landing/project-card.tsx`. Its dark shadcn dialog, wrapping Previous/Next actions, horizontal swipe handling, keyboard arrows and active thumbnail strip informed the shared viewer. Kotlin Reforge was read only; none of its files were changed.

Workspace/project filmstrips, library images, live/exported cards, language previews and Copy now use one shadcn gallery dialog. Clicking artwork no longer opens a new tab automatically. The viewer starts at the clicked image, navigates within its gallery, fits images without clipping, supports native-size and relative zoom, drag panning, pinch/trackpad zoom and explicit original/download actions. Live cards render their selected locale/device and show missing-copy/capture/callout warnings. Copy preview retains its unsaved-draft notice and does not write files. Invalid images offer retry, with a live fallback when available.

Escape closes the topmost viewer even when one of its tooltips is open, and focus returns to the original image button. Static preview iframes stay outside pointer and keyboard interaction. The modal uses instant geometry changes to avoid clipping its controls during a viewport resize. Missing thumbnail images get a fallback icon. Re-selecting the current thumbnail preserves its loaded image. Existing callout-selection canvases remain interactive editors.

**27 automated checks pass:** 13 gallery/workspace checks and 14 browser cases. The five new viewer cases cover overview click/open with no popup or document reload; wrapping arrows/thumbnails and keyboard navigation; native zoom, pan and Fit; focus restoration; live/exported/locale accuracy and retained original iframes; recovery after an invalid file; an actual touch swipe through Chrome’s touch input; narrow-screen bounds; unsaved Copy data retention without automatic saves; and an eight-image gallery with visible controls across viewport changes. All browser writes used temporary fixtures and a separate project registry.

The real WiFi project’s overview and live gallery were visually reviewed in the viewer on desktop and mobile. The renderer, artwork, captures, copy and gallery data were not changed. Documentation and the compiled UI are synced into WiFi Weakspot, ChangeDetection and Calcula at v4.1. No commits or publication actions were made.

## Studio v4.2 — overview and shared controls — 26 October 2026

Refined the workspace, project overview, language screen, device tabs and shared theme. All project filtering uses real shadcn Tabs, TabsList, TabsTrigger and connected TabsContent. The count badges, cards, progress indicators, menus, input fields and table continue to use shared shadcn components. Fixed tab sizing so mobile touch targets do not overflow their tab lists. Page headers now respond to the content width rather than the window width; the local-only header text no longer crowds the breadcrumb on narrow desktop windows. Long project folders truncate with the full path available by hover and copy.

Validation: production build passed; all 13 model/server checks and all 15 browser checks passed (28 total). Added coverage for filter tab/panel associations, keyboard selection, filter/search combinations, empty-state recovery, and fitted controls at 320, 390, 798 and 1440px. Existing gallery dialog, draft retention, local-save conflict handling, callout targeting and sidebar navigation checks passed. Browser interactions used temporary projects and a temporary registry. The real WiFi overview and Languages screen were visually reviewed. App artwork and locale data were not changed.

The compiled Studio v4.2 is synced into WiFi Weakspot, ChangeDetection and Calcula. No commits were made. The exact palette changes are recorded in DESIGN-NOTES.md.

## Studio v4.3 — project sections and focused editing — 26 October 2026

Project overviews now separate Overview, Galleries and Languages using shadcn Tabs with URL-backed selection. The overview identifies the next unfinished language, and gallery links retain the intended reference locale and device. Languages supports search and asset-status filters, a wide-screen table, and narrow-screen cards showing all four counts with accessible edit/review actions. Route tabs use manual activation to avoid duplicate history entries from focus and pointer events.

The workbench shows a shadcn device Select when there is insufficient width for device tabs. Copy reference/input columns respond to the field width; references have a muted surface, placeholders distinguish reference writing from translation, and shortcut hints follow the platform. Project actions wrap on very narrow screens.

Production build passed. All 13 model/server checks and 17 browser checks passed (30 total). New checks cover project-section URLs, browser Back/Forward and reload, language search/status combinations and recovery, action visibility at 320/390/798px, gallery links, narrow copy-field stacking, device switching and preserved iframe identity. Existing save-conflict, draft, callout, image viewer and sidebar checks passed. Tests mutate temporary projects only. The real Calcula project was visually reviewed. No app artwork, capture files, sample data or locale copy was edited. Studio v4.3 is synced into all three apps and remains uncommitted.
