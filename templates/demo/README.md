# The Screenshot Studio demo

Real captures of ChangeDetection, an Android app that watches web pages, in three languages, made into a Google Play set.
Try things, then export again:

| Try | Edit |
|---|---|
| Another look | `npx screenshot-studio demo --theme paper` (or `aurora`, `mono`, `panels`, `porcelain`, `signal`) |
| Other words | `en-US/copy.json`, `de-DE/copy.json`, `zh-CN/copy.json`: *stars* highlight, `\n` breaks a line |
| The colors | the first three variables in `theme.css` |
| The layouts | `gallery.json`: `big`, `hang`, `duo` (two devices) |

```sh
npx screenshot-studio export            # render and check every card
npx screenshot-studio studio --open     # the editor
```
