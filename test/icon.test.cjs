const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const CLI = path.join(__dirname, '..', 'studio', 'studio.cjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'icon');
const expected = name => fs.readFileSync(path.join(FIXTURES, 'expected', name), 'utf8');
const icons = (args, cwd = FIXTURES) => spawnSync(process.execPath, [CLI, 'icons', ...args], {cwd, encoding: 'utf8'});
/** A copy of the fixture app to draw into. */
const app = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-icon-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.cpSync(path.join(FIXTURES, 'app'), dir, {recursive: true});
  return dir;
};
const pngSize = file => { const png = fs.readFileSync(file); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
/** Every <g> the SVG opens is closed. */
const balanced = svg => (svg.match(/<g\b/g) || []).length === (svg.match(/<\/g>/g) || []).length;

test('--import turns a vector drawable into a 108 x 108 layer: groups, clips, alphas, strokes and gradients', () => {
  const run = icons(['--import', 'gradient.xml']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, expected('gradient.svg'));
  assert.ok(balanced(run.stdout));
  assert.match(run.stdout, /<g transform="scale\(2 2\)">/);
  assert.match(run.stdout, /fill="#FF0000" fill-opacity="0.251" fill-rule="evenodd"/);
  assert.match(run.stdout, /fill="url\(#grad1\)" stroke="url\(#grad2\)" stroke-width="2"/);
});

test('--import reads the vector inside an animated vector and closes a clip at the end of its group', () => {
  const run = icons(['--import', 'animated.xml']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /<!-- Imported from animated\.xml\. -->/);
  assert.match(run.stdout, /<g transform="scale\(4\.5 4\.5\)">/);
  assert.match(run.stdout, /<g clip-path="url\(#clip0\)"><path d="M12[^"]*" fill="#000000"\/><\/g><\/g>/);
  assert.ok(balanced(run.stdout));
});

test('--import refuses what is not a vector drawable', () => {
  const shape = icons(['--import', 'shape.xml']);
  assert.equal(shape.status, 1);
  assert.match(shape.stderr, /shape\.xml is not an Android vector drawable/);
  const broken = icons(['--import', 'broken.xml']);
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /broken\.xml is not valid XML: <\/vector> on line 4 closes <group>/);
});

test('icons draws adaptive icons, variants and files from the brand layers', t => {
  const root = app(t);
  const run = icons([], root);
  assert.equal(run.status, 0, run.stderr);
  const written = run.stdout.trim().split('\n');
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  assert.deepEqual(written, [
    ...densities.flatMap(d => ['background', 'foreground', 'monochrome', '', 'round']
      .map(part => `app/src/main/res/mipmap-${d}/ic_launcher${part ? `_${part}` : ''}.png`)),
    'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    'web/favicon.svg', 'web/mark.svg', 'web/icon.png', 'web/favicon.ico',
    'store-listing/brand/icon-preview.png',
    ...densities.flatMap(d => ['background', 'foreground'].map(part => `app/src/beta/res/drawable-${d}/ic_beta_${part}.png`)),
    'app/src/beta/res/drawable-anydpi-v26/ic_beta.xml',
    'store-listing/brand/beta/icon-preview.png',
  ]);
  const file = name => path.join(root, name);
  assert.equal(fs.readFileSync(file('app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8'), expected('ic_launcher.xml'));
  assert.equal(fs.readFileSync(file('app/src/beta/res/drawable-anydpi-v26/ic_beta.xml'), 'utf8'), expected('ic_beta.xml'));
  // Layers share one document: ids are prefixed with the layer's name, and bitmap art is inlined.
  assert.equal(fs.readFileSync(file('web/favicon.svg'), 'utf8'), expected('favicon.svg'));
  assert.equal(fs.readFileSync(file('web/mark.svg'), 'utf8'), expected('mark.svg'));
  assert.deepEqual(pngSize(file('app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png')), [432, 432]);
  assert.deepEqual(pngSize(file('app/src/main/res/mipmap-hdpi/ic_launcher_round.png')), [72, 72]);
  assert.deepEqual(pngSize(file('web/icon.png')), [64, 64]);
  const ico = fs.readFileSync(file('web/favicon.ico'));
  assert.equal(ico.readUInt16LE(4), 7);
  assert.deepEqual([...Array(7)].map((_, i) => ico[6 + i * 16]), [16, 24, 32, 48, 64, 128, 0]);
});

test('icons says which layer is missing or misdrawn', t => {
  const root = app(t), brand = path.join(root, 'store-listing', 'brand');
  fs.rmSync(path.join(brand, 'foreground.svg'));
  let run = icons([], root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Missing store-listing\/brand\/foreground\.svg/);
  fs.writeFileSync(path.join(brand, 'foreground.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>');
  run = icons([], root);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /store-listing\/brand\/foreground\.svg must be an <svg viewBox="0 0 108 108">/);
});

test('Apple icon bundles preserve custom background layer names', t => {
  const root=app(t),brand=path.join(root,'store-listing/brand');
  fs.writeFileSync(path.join(brand,'icon.json'),JSON.stringify({files:[{path:'Test.icon',apple:{Backdrop:'background',Mark:'foreground'}}]}));
  const run=icons([],root);assert.equal(run.status,0,run.stderr);
  const bundle=path.join(root,'Test.icon');
  const json=JSON.parse(fs.readFileSync(path.join(bundle,'icon.json')));
  const background=json.groups[0].layers.find(l=>l.name==='Backdrop');
  assert.equal(background['image-name'],'Backdrop.png');
  for(const layer of json.groups[0].layers) assert.ok(fs.existsSync(path.join(bundle,'Assets',layer['image-name'])));
});
