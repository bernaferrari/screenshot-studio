# Agents

Claude Code, or any coding agent, can make and refine an app's store art with the studio: it edits the same files you would, and the studio renders and checks them. Agents can see images, so they can judge a card the way you do.

## The skill

`npx screenshot-studio init` installs a skill at `.claude/skills/store-screenshots/SKILL.md` in the app (from `skills/store-screenshots/SKILL.md` here). Claude Code picks it up when you ask for store screenshots, a Play or App Store listing, README images, or a translation of them. It covers setup, which file to edit for what, the loop below, what a good card looks like, and what to check before finishing.

Other agents can read the same file: point them at it, or copy it where they look for instructions.

## The MCP server

```sh
claude mcp add screenshot-studio -- npx screenshot-studio mcp
```

Run it from the app's repository. Other MCP clients take the same command: `npx` with the arguments `screenshot-studio mcp`. `--listing path/to/app` serves another folder, and every tool takes an optional `listing` too.

| Tool | Does |
|---|---|
| `describe_listing` | The galleries and their sizes, every card (layout, captures, headline, output file), the languages and theme files. Start here. |
| `check` | The file check, in a second: each problem with what to do about it |
| `render_card` | Renders one card (`gallery`, `card`, optional `locale`) and returns the image, with its notes, where everything landed (`layout`: each device, the headline and each callout in card pixels), or why it failed |
| `export` | Renders and checks everything (optionally one `locale` or `gallery`, `strict`) and writes the images |
| `view_image` | Shows an image in `store-listing/`: a card, a capture, or `en-US/contact-phone.jpg` for the whole strip |
| `emulator_screen` | The capture emulator: a screenshot and every element on screen with its label, ID and bounds, the tappable ones marked. The labels are what a tour's `d.tap("…")` takes |
| `emulator_tap` | Taps a label, a point `x,y`, or `back` on the capture emulator and returns the screen after, so an agent can find the screens a tour should capture |

Large images come back scaled down to fit an agent's limits, on any platform. The emulator tools drive emulators only, never a phone; the CLI's `npx screenshot-studio screen [--tap "Settings"] [--json]` does the same.

## The loop

1. **Edit** `theme.css`, `theme.js`, `gallery.json` or `<locale>/copy.json`.
2. **Check**: `check` (or `npx screenshot-studio check`). Fix every error before rendering.
3. **Render**: `render_card` for the card you changed (or `npx screenshot-studio export --kind phone --card 0`).
4. **Look**: `view_image` on the card, and after an `export`, on the contact sheet. Judge it against the playbook's design table ([Playbook](playbook.md)), then edit again.

**Capturing the app** works the same way: look with `emulator_screen`, move with `emulator_tap`, write what you did as the scenes of `store-listing/capture.tour.mjs` (`'02-settings': d => d.tap('Settings')`), and run `npx screenshot-studio recapture`. If the capture emulator isn't running, the error lists the ways forward ([Capturing](capture.md)).

Without MCP, the CLI does the same: `check --json` and `export --json` print results a tool can read, and the agent opens the images itself. Never call a card done without looking at it.

The editor follows the files live, so you can watch an agent's changes land in `npx screenshot-studio studio` as it works ([The editor](editor.md)).
