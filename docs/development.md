# Development

Working on the studio itself. Agents changing it: read `AGENTS.md` too.

## Layout

| Path | What |
|---|---|
| `src/core/` | Shared by everything: types (`types.d.ts`), gallery rules, the renderer's rules (`layout.ts`: headline markup, frame sizes, bounds, callout placement), the schema validator |
| `src/renderer/` | The card renderer that runs in the browser: `render.ts` runs the steps (`load`, `text`, `devices`, `identity`, `callouts`, `fit`) and the theme's hooks between them; `preview.html`, `studio.css`, the opt-in `layouts.css`, and `shapes.ts` for themes |
| `src/node/` | The Node library: export, check, recapture, init, server and workspace, MCP, icons, fixtures; `capture/` runs tours on agent-device (`tour.ts`, `screen.ts`) and sets up the Android emulator (`emulator.ts`) and iOS simulators (`simulator.ts`) |
| `src/cli/main.ts` | The `screenshot-studio` command, and the library's public exports |
| `ui/src/` | The editor (React, shadcn/ui, Tailwind) |
| `schemas/` | JSON Schemas for the files an app keeps, generated from `src/core/types.d.ts` by `npm run schemas`. Never edit them by hand. |
| `themes/`, `templates/` | What `init` copies into a new app |
| `skills/store-screenshots/` | The skill `init` installs in an app ([Agents](agents.md)) |
| `studio/` | **Built output**: what the package ships and serves to each app. Never edit it by hand. |
| `docs/` | These guides; `docs/images/make.mjs` rebuilds the README images |

## Build and test

```sh
npm ci
npm run build        # build:studio (tsc + rolldown → studio/) and build:ui (Vite → studio/assets/)
npm run typecheck    # the studio (tsconfig.json) and the editor (tsconfig.ui.json), both strict
npm run schemas      # schemas/ from the types in src/core/types.d.ts (build runs it too)
npm test             # unit tests, against the built studio/studio.cjs, and the editor's logic in ui/src/lib
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
- **Apps keep no copy.** The package serves `studio/` at each app's `store-listing/studio/` address, and runs each app's `capture.tour.mjs` itself. Keep those addresses stable: themes import `./studio/shapes.js`.
- **Check against a real app** before calling a change done: copy one (never edit it in place), run `check` and `export` in it, and look at the images.

Commit the built `studio/` with the source change: it's what the package ships.

## The editor

The editor shares its types with the studio: the files an app keeps come from `src/core/types.d.ts`, the server's answers from `src/node/workspace/` (imported as types only). `ui/src/lib/` holds everything that isn't a component: the project model and live reload (`project.ts`, `live.ts`), drafts, the review, routes and the API. Components live in `ui/src/components/`, a folder per view (`gallery/`, `viewer/`, `callout/`, `copy/`, `projects/`), with their own hooks beside them. The pure logic behind them (the viewer's and picker's state and geometry, copy rows, kept strips, the connect form) is in `ui/src/lib/` too, and `test/editor.test.mjs` loads those modules straight from TypeScript: keep their imports type-only.

It is built from the official shadcn/ui components (`ui/src/components/ui/`, set up in `components.json`), owned here and tailored where needed. The build bundles React and every dependency, so an app needs only Node to run the editor: no npm install, no CDN. It uses the neutral shadcn palette in light and dark; app artwork keeps its own theme. The renderer files stay separate from the bundle, so each app keeps its own artwork. The shadcn MIT notice is in `ui/SHADCN-LICENSE.md` and ships with the bundle.

## README images

```sh
node docs/images/make.mjs --editor
```

Composes the README's images from the apps' own exports (`APPS=…`, the folder holding the apps; `~/Documents/android` by default). `--editor` also screenshots the editor and records `demo.gif` on a fresh `demo` project, with a temporary home and project list (ffmpeg makes the GIF).
