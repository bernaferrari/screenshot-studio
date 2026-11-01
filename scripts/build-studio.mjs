// Builds studio/, the runtime the package ships (served to each app at its store-listing/studio/ address), from src/:
//   studio.cjs   every command and the Node library (src/cli, src/node, src/core), one file
//   render.js    the card renderer (src/renderer/render.ts), loaded by preview.html
//   shapes.js    helpers themes import (src/renderer/shapes.ts)
//   types.d.ts   types for themes and tools; schemas/ (generated from them) for checks and editor autocomplete
//   capture.py, uitree.py   the emulator side (capture/)
// The editor (studio/index.html, studio/assets/) is built separately by `npm run build:ui`.
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'studio');
const KEEP = new Set(['VERSION', 'package.json', 'index.html', 'assets']);

// Start clean, except the editor build and the version.
for (const entry of fs.readdirSync(out)) if (!KEEP.has(entry)) fs.rmSync(path.join(out, entry), {recursive: true, force: true});

const banner = '// Built from https://github.com/bernaferrari/screenshot-studio (src/). Edit the source, not this file.';
await build({
  input: path.join(root, 'src/cli/main.ts'),
  platform: 'node',
  external: [/^node:/, 'playwright'],
  output: {file: path.join(out, 'studio.cjs'), format: 'cjs', codeSplitting: false, banner: `#!/usr/bin/env node\n${banner}`},
});
for (const [entry, file] of [['src/renderer/render.ts', 'render.js'], ['src/renderer/shapes.ts', 'shapes.js']]) {
  await build({
    input: path.join(root, entry),
    platform: 'browser',
    // The app's own theme sits beside the studio folder and loads at runtime.
    external: ['../theme.js'],
    output: {file: path.join(out, file), format: 'esm', codeSplitting: false, banner},
  });
}
fs.chmodSync(path.join(out, 'studio.cjs'), 0o755);

for (const file of ['preview.html', 'studio.css', 'layouts.css']) fs.copyFileSync(path.join(root, 'src/renderer', file), path.join(out, file));
fs.copyFileSync(path.join(root, 'src/core/types.d.ts'), path.join(out, 'types.d.ts'));
fs.cpSync(path.join(root, 'schemas'), path.join(out, 'schemas'), {recursive: true});
for (const file of fs.readdirSync(path.join(root, 'capture'))) if (file.endsWith('.py')) fs.copyFileSync(path.join(root, 'capture', file), path.join(out, file));

console.log(`studio/ built: ${fs.readdirSync(out).sort().join(', ')}`);
