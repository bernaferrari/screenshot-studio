# Development

Working on the studio itself. Agents changing it: read `AGENTS.md` too.

## Layout

| Path | What |
|---|---|
| `src/core/` | Shared by everything: types (`types.d.ts`), gallery rules, the schema validator |
| `src/renderer/` | The card renderer that runs in the browser (`render.ts`, `preview.html`, `studio.css`) and `shapes.ts` for themes |
| `src/node/` | The Node library: export, check, recapture, init, server and workspace, MCP, icons, fixtures |
| `src/cli/main.ts` | The `screenshot-studio` command, and the library's public exports |
| `ui/src/` | The editor (React, shadcn/ui, Tailwind) |
| `capture/` | The emulator and simulator side (Python): tours import `capture.py` and `ios.py`; `capture_*.py` and `uitree.py` hold the rest, shipped flat beside them |
| `schemas/` | JSON Schemas for the files an app keeps, generated from `src/core/types.d.ts` by `npm run schemas`. Never edit them by hand. |
| `themes/`, `templates/` | What `init` copies into a new app |
| `skills/store-screenshots/` | The skill `init` installs in an app ([Agents](agents.md)) |
| `studio/` | **Built output**: what the package ships and serves to each app. Never edit it by hand. |
| `docs/` | These guides; `docs/images/make.cjs` rebuilds the README images |

## Build and test

```sh
npm ci
npm run build        # build:studio (tsc + rolldown → studio/) and build:ui (Vite → studio/assets/)
npm run typecheck    # the studio (tsconfig.json) and the editor (tsconfig.ui.json), both strict
npm run schemas      # schemas/ from the types in src/core/types.d.ts (build runs it too)
npm test             # unit tests, against the built studio/studio.cjs
npx playwright install chromium    # once, if Playwright has no browser
npm run test:ui      # the editor in a browser, on temporary projects
npm run dev          # Vite, for working on ui/src
```

Build before testing: the tests load `studio/studio.cjs`, which is what apps run. The browser suite uses temporary fixtures and its own project registry, so it never touches yours.

To try a change the way users run it, call the built command directly: `node /path/to/screenshot-studio/studio/studio.cjs <command>` is what `npx screenshot-studio <command>` runs.

## Rules

- **Modules have no side effects.** Everything Node-side is bundled into one file; nothing may parse `process.argv`, exit, or start work at import time. A command is a `run(argv): Promise<number>` next to a library function that returns a typed result.
- **Errors say what to do.** Throw `Error` with a message a user can act on ("No studio.json in …. Run `npx screenshot-studio init` first."). Library functions report problems in their result; only `run` prints.
- **Read studio files with `readJson`** (`src/node/project.ts`) or the renderer's `json`: they drop the `$schema` key.
- **Apps keep no copy.** The package serves `studio/` at each app's `store-listing/studio/` address, and tours get the capture module on `PYTHONPATH`. Keep those addresses stable: themes import `./studio/shapes.js`.
- **Check against a real app** before calling a change done: copy one (never edit it in place), run `check` and `export` in it, and look at the images.

Commit the built `studio/` with the source change: it's what the package ships.

## The editor

The editor shares its types with the studio: the files an app keeps come from `src/core/types.d.ts`, the server's answers from `src/node/workspace/` (imported as types only). `ui/src/lib/` holds everything that isn't a component: the project model and live reload (`project.ts`, `live.ts`), drafts, the review, routes and the API.

It is built from the official shadcn/ui components (`ui/src/components/ui/`, set up in `components.json`), owned here and tailored where needed. The build bundles React and every dependency, so an app needs only Node to run the editor: no npm install, no CDN. It uses the neutral shadcn palette in light and dark; app artwork keeps its own theme. The renderer files stay separate from the bundle, so each app keeps its own artwork. The shadcn MIT notice is in `ui/SHADCN-LICENSE.md` and ships with the bundle.

## README images

```sh
node docs/images/make.cjs --editor
```

Composes the README's images from the apps' own exports (`--apps`, the folder holding the apps). `--editor` also screenshots the editor, on a server with a temporary project list.
