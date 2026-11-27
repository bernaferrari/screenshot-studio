# The Screenshot Studio demo

Real captures of WiFi Weakspot, an Android app that maps where your Wi-Fi gets weak, in three languages, made into a Google Play set.
Try things, then export again:

| Try | Edit |
|---|---|
| Another look | `npx screenshot-studio demo --theme paper` (or `aurora`, `mono`, `panels`, `porcelain`, `signal`) |
| Other words | `en-US/copy.json`, `de-DE/copy.json`, `zh-CN/copy.json`: *stars* highlight, `\n` breaks a line |
| The colors | the three shadcn/ui tokens at the top of `theme.css` (`--background`, `--foreground`, `--primary`) |
| The layouts | `gallery.json`: `big`, `hang`, `duo` (two devices) |

```sh
npx screenshot-studio export            # render and check every card
npx screenshot-studio studio --open     # the editor
```
