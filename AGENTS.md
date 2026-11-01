# Working on Screenshot Studio

Instructions for agents changing the studio itself. To *use* the studio in an app, follow `skills/store-screenshots/SKILL.md`.

## Layout

| Path | What |
| --- | --- |
| `src/core/` | Shared by everything: types (`types.d.ts`), gallery rules, the schema validator |
| `src/renderer/` | The card renderer that runs in the browser (`render.ts`, `preview.html`, `studio.css`) and `shapes.ts` for themes |
| `src/node/` | The Node library: export, check, recapture, init, server and workspace, MCP, icons, fixtures |
| `src/cli/main.ts` | The `screenshot-studio` command, and the library's public exports |
| `ui/src/` | The editor (React, shadcn/ui, Tailwind) |
| `capture/` | The emulator and simulator side (Python) |
| `schemas/` | JSON Schemas for the files an app keeps |
| `themes/`, `templates/` | What `init` copies into a new app |
| `studio/` | **Built output**, the folder each app gets a copy of. Never edit it by hand. |

## Build and test

```sh
npm run build        # build:studio (tsc + rolldown → studio/) and build:ui (Vite → studio/assets/)
npm run typecheck
npm test             # unit tests, against the built studio/studio.cjs
npm run test:ui      # the editor in a browser
```

Build before testing: the tests load `studio/studio.cjs`, which is what apps run.

## Rules

- **Modules have no side effects.** Everything Node-side is bundled into one file; nothing may parse `process.argv`, exit, or start work at import time. A command is a `run(argv): Promise<number>` next to a library function that returns a typed result.
- **Errors say what to do.** Throw `Error` with a message a user can act on ("No studio.json in …. Run `npx screenshot-studio init` first."). Library functions report problems in their result; only `run` prints.
- **Read studio files with `readJson`** (`src/node/project.ts`) or the renderer's `json`: they drop the `$schema` key.
- **Apps run their own copy.** Changes reach an app through `npx screenshot-studio sync`. Bump `studio/VERSION` for changes apps should notice.
- **Check against a real app** before calling a change done: copy one (never edit it in place), sync, `check`, `export`, and look at the images.
