// `demo` makes a finished set from the bundled captures, and swaps the theme when run again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const STUDIO = path.join(__dirname, '..', 'studio', 'studio.cjs');
const demo = (cwd, ...args) => spawnSync(process.execPath, [STUDIO, 'demo', '--no-open', ...args], {cwd, encoding: 'utf8'});

test('demo exports every card in every language with no warnings, then swaps the theme', {timeout: 180_000}, () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-demo-'));
  try {
    const first = demo(cwd);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const listing = path.join(cwd, 'screenshot-studio-demo', 'store-listing');
    for (const locale of ['en-US', 'de-DE', 'zh-CN']) assert.equal(fs.readdirSync(path.join(listing, locale, 'phone')).length, 3, locale);
    assert.doesNotMatch(first.stdout, /warning/i);
    const second = demo(cwd, '--theme', 'paper');
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.ok(fs.existsSync(path.join(listing, 'assets', 'SchibstedGrotesk-latin.woff2')), 'paper\'s font is installed');
    assert.ok(!fs.readdirSync(path.join(listing, 'assets')).some(f => f.startsWith('Archivo')), 'signal\'s font is gone');
  } finally { fs.rmSync(cwd, {recursive: true, force: true}); }
});

test('demo --3d draws real 3D phones, tilted, and running it again without the flag stands them back up', {timeout: 180_000}, () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-demo-3d-'));
  try {
    const listing = path.join(cwd, 'screenshot-studio-demo', 'store-listing');
    const deep = demo(cwd, '--3d');
    assert.equal(deep.status, 0, deep.stdout + deep.stderr);
    assert.doesNotMatch(deep.stdout, /warning/i);
    assert.match(fs.readFileSync(path.join(listing, 'theme.js'), 'utf8'), /depth: true/);
    assert.ok(JSON.parse(fs.readFileSync(path.join(listing, 'gallery.json'), 'utf8')).phone.every(card => card.layout.split(' ').includes('tilt')));
    const flat = demo(cwd);
    assert.equal(flat.status, 0, flat.stdout + flat.stderr);
    assert.doesNotMatch(fs.readFileSync(path.join(listing, 'theme.js'), 'utf8'), /depth/);
    assert.ok(JSON.parse(fs.readFileSync(path.join(listing, 'gallery.json'), 'utf8')).phone.every(card => !card.layout.includes('tilt')));
  } finally { fs.rmSync(cwd, {recursive: true, force: true}); }
});
