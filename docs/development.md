# Development

Working on the studio itself.

## Layout

| Path | What |
|---|---|
| `studio/` | Everything an app gets: renderer (`preview.html`, `core.js`, `gallery.js`, `studio.css`, `shapes.js`), exporter, capture, icons, server, and the built editor in `assets/` |
| `ui/src/` | The editor's source: React with shadcn/ui and Tailwind |
| `init.cjs` | Scaffolds `store-listing/` in a new app |
| `sync.sh` | Copies `studio/` into an app |
| `docs/` | These guides; `docs/images/make.cjs` rebuilds the README images |

## The editor UI

```sh
npm ci
npm run dev       # Vite, for working on ui/src
npm run build     # writes the bundle to studio/assets/ and generates studio/index.html
```

The editor is built from the official shadcn/ui components (`ui/src/components/ui/`, set up in `components.json`), owned here and tailored where needed. The build bundles React and every dependency, so an app needs only Node to run the editor: no npm install, no CDN. It uses the neutral shadcn palette in light and dark; app artwork keeps its own theme. The renderer files stay separate from the bundle, so each app keeps its own artwork. The shadcn MIT notice is in `ui/SHADCN-LICENSE.md` and ships with the bundle.

Commit the built bundle with the source change: apps sync `studio/` as is.

## Syncing into apps

Never edit an app's `store-listing/studio/`; change it here, then:

```sh
./sync.sh /path/to/app            # copy studio/ into the app
./sync.sh /path/to/app --check    # report differences
```

Bump `studio/VERSION` when apps should notice a change.

## Tests

```sh
npm test                           # gallery and workspace
npx playwright install chromium    # once, if Playwright has no browser
npm run test:ui                    # the editor, in a browser, on temporary projects
```

The browser suite uses temporary fixtures and its own project registry, so it never touches yours. Build before running it after changing `ui/src`.

## README images

```sh
PLAYWRIGHT_MODULE=$PWD/node_modules/playwright node docs/images/make.cjs --editor
```

Composes the README's images from the apps' own exports (`--apps`, default `~/Documents/android`). `--editor` also screenshots the editor, on a server with a temporary project list.
