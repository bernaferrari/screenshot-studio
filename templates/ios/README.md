# {{name}} · store listing

Made with [Screenshot Studio](https://github.com/bernaferrari/screenshot-studio).

| To change | Edit |
| --- | --- |
| Cards, their order and captures | `gallery.json` |
| Words, per language | `<locale>/copy.json`, `<locale>/listing.json` |
| The look | `theme.css`, `theme.js` |
| Image and capture sizes | `profiles.json` |
| The capture tour | `capture.tour.mjs` (build and runs: `studio.json` → `capture`) |

```sh
npx screenshot-studio studio --open     # the editor
npx screenshot-studio check             # quick check, no rendering
npx screenshot-studio export            # render every card
npx screenshot-studio recapture --boot  # build, capture on the simulator, export
```
