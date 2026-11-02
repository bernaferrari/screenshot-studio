// Builds studio/, the runtime the package ships (served to each app at its store-listing/studio/ address), from src/:
//   studio.cjs   every command and the Node library (src/cli, src/node, src/core), one file
//   render.js    the card renderer (src/renderer/render.ts), loaded by preview.html
//   shapes.js    helpers themes import (src/renderer/shapes.ts)
//   devices3d.js real 3D devices for themes with `depth` (src/renderer/devices3d.ts, with three.js), loaded on demand
//   types.d.ts   types for themes and tools; schemas/ (generated from them) for checks and editor autocomplete
//   capture.py, ios.py and their siblings   the emulator and simulator side (capture/*.py, flat, for PYTHONPATH)
// The editor (studio/index.html, studio/assets/) is built separately by `npm run build:ui`.
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'rolldown';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'studio');
const KEEP = new Set(['package.json', 'index.html', 'assets']);

// Start clean, except the editor build.
for (const entry of fs.readdirSync(out)) if (!KEEP.has(entry)) fs.rmSync(path.join(out, entry), {recursive: true, force: true});

const banner = '// Built from https://github.com/bernaferrari/screenshot-studio (src/). Edit the source, not this file.';
// devices3d.js bundles three.js, which asks for its notice to travel with it.
const THREE_NOTICE = `/*! three.js r${JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version.split('.')[1]}, https://threejs.org\n${fs.readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8').trim()} */`;
await build({
  input: path.join(root, 'src/cli/main.ts'),
  platform: 'node',
  external: [/^node:/, 'playwright'],
  output: {file: path.join(out, 'studio.cjs'), format: 'cjs', codeSplitting: false, banner: `#!/usr/bin/env node\n${banner}`},
});
for (const [entry, file] of [['src/renderer/render.ts', 'render.js'], ['src/renderer/shapes.ts', 'shapes.js'], ['src/renderer/devices3d.ts', 'devices3d.js']]) {
  await build({
    input: path.join(root, entry),
    platform: 'browser',
    // The app's own theme sits beside the studio folder and loads at runtime; 3D devices load only when a theme asks.
    external: ['../theme.js', './devices3d.js'],
    output: {file: path.join(out, file), format: 'esm', codeSplitting: false, banner: file === 'devices3d.js' ? `${banner}\n${THREE_NOTICE}` : banner,
      minify: file === 'devices3d.js'},
  });
}
fs.chmodSync(path.join(out, 'studio.cjs'), 0o755);
// The version the MCP server reports, from package.json.
fs.writeFileSync(path.join(out, 'VERSION'), JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version + '\n');

for (const file of ['preview.html', 'studio.css', 'layouts.css']) fs.copyFileSync(path.join(root, 'src/renderer', file), path.join(out, file));
fs.copyFileSync(path.join(root, 'src/core/types.d.ts'), path.join(out, 'types.d.ts'));
fs.cpSync(path.join(root, 'schemas'), path.join(out, 'schemas'), {recursive: true});
for (const file of fs.readdirSync(path.join(root, 'capture'))) if (file.endsWith('.py')) fs.copyFileSync(path.join(root, 'capture', file), path.join(out, file));

console.log(`studio/ built: ${fs.readdirSync(out).sort().join(', ')}`);
