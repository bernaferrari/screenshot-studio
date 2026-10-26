import fs from "node:fs";
import path from "node:path";
const target = "studio/assets";
fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(target))
  fs.rmSync(path.join(target, file), { recursive: true, force: true });
for (const file of fs.readdirSync(".ui-build"))
  fs.copyFileSync(path.join(".ui-build", file), path.join(target, file));
fs.copyFileSync(
  "ui/SHADCN-LICENSE.md",
  path.join(target, "shadcn-LICENSE.txt"),
);
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const notices = [
  "Screenshot Studio — third-party runtime notices",
  fs.readFileSync("ui/SHADCN-LICENSE.md", "utf8"),
];
for (const [directory, metadata] of Object.entries(lock.packages || {})) {
  if (
    !directory.startsWith("node_modules/") ||
    metadata.dev ||
    !fs.existsSync(directory)
  )
    continue;
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
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Screenshot Studio</title><link rel="stylesheet" href="./assets/studio.css"></head><body><div id="root"><div style="padding:32px;font:14px system-ui">Opening Screenshot Studio…</div></div><script defer src="./assets/studio.js"></script></body></html>\n`,
);
console.log("Installed the self-contained shadcn UI into studio/assets.");
