import fs from "node:fs";
import path from "node:path";
const target = "studio/assets";
fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(target))
  fs.rmSync(path.join(target, file), { recursive: true, force: true });
for (const file of fs.readdirSync(".ui-build"))
  if (file !== "bundled-packages.json") fs.copyFileSync(path.join(".ui-build", file), path.join(target, file));
// The tab's icon: the studio's own (drawn in docs/brand/, written by `screenshot-studio icons docs/brand/icon.json`).
fs.copyFileSync("ui/logo.svg", path.join(target, "favicon.svg"));
fs.copyFileSync(
  "ui/SHADCN-LICENSE.md",
  path.join(target, "shadcn-LICENSE.txt"),
);
// Notices for the packages the build bundled (vite.config.js records them) and their runtime dependencies, which
// may be bundled in part.
const bundled = new Set(JSON.parse(fs.readFileSync(".ui-build/bundled-packages.json", "utf8")));
for (const directory of bundled) {
  const {dependencies = {}} = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  for (const name of Object.keys(dependencies)) {
    // Node's lookup: the package's own node_modules first, then each folder up.
    for (let dir = directory; dir; dir = path.dirname(dir) === dir ? "" : path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) { bundled.add(path.relative(".", candidate)); break; }
      if (dir === ".") break;
    }
  }
}
const notices = [
  "Screenshot Studio — third-party runtime notices",
  fs.readFileSync("ui/SHADCN-LICENSE.md", "utf8"),
];
for (const directory of [...bundled].sort()) {
  const info = JSON.parse(
    fs.readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const licenses = fs
    .readdirSync(directory)
    .filter(
      (file) =>
        /^(licen[cs]e|copying)([.-]|$)/i.test(file) &&
        fs.statSync(path.join(directory, file)).isFile(),
    );
  notices.push(
    `\n--- ${info.name}@${info.version} (${info.license || "see notice"}) ---\n`,
  );
  for (const license of licenses)
    notices.push(fs.readFileSync(path.join(directory, license), "utf8"));
}
fs.writeFileSync(
  path.join(target, "THIRD_PARTY_NOTICES.txt"),
  notices.join("\n"),
);
fs.writeFileSync(
  "studio/index.html",
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Screenshot Studio</title><link rel="icon" href="./assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./assets/studio.css"></head><body><div id="root"><div style="padding:32px;font:14px system-ui">Opening Screenshot Studio…</div></div><script defer src="./assets/studio.js"></script></body></html>\n`,
);
console.log("Installed the self-contained shadcn UI into studio/assets.");
