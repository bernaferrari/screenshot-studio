const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {checkListing, recapture} = require('../studio/studio.cjs');

const CLI = path.join(__dirname, '..', 'studio', 'studio.cjs');
/** A PNG header with the given size: enough for the studio's size checks. */
const png = (width, height) => {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(head);
  head.writeUInt32BE(width, 16); head.writeUInt32BE(height, 20);
  return head;
};
const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ios-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('init --platform ios builds App Store galleries from simulator screenshots', t => {
  const root = temp(t), shots = path.join(root, 'shots'), app = path.join(root, 'app');
  fs.mkdirSync(shots); fs.mkdirSync(app);
  fs.writeFileSync(path.join(shots, '01-home.png'), png(1320, 2868));
  fs.writeFileSync(path.join(shots, '02-ipad.png'), png(2064, 2752));
  const run = spawnSync(process.execPath, [CLI, 'init', app, '--platform', 'ios', '--screenshots', shots], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Ready: 3 card/);
  const listing = path.join(app, 'store-listing');
  const profiles = json(path.join(listing, 'profiles.json'));
  assert.deepEqual(Object.keys(profiles).filter(k => k !== '$schema'), ['iphone', 'iphone63', 'ipad']);
  assert.equal(profiles.iphone.frame, 'iphone');
  assert.equal(profiles.iphone.platform, 'ios');
  assert.deepEqual([profiles.iphone63.width, profiles.iphone63.height], [1206, 2622]);
  assert.deepEqual([profiles.ipad.width, profiles.ipad.height], [2064, 2752]);
  assert.deepEqual(json(path.join(listing, 'gallery.json')).iphone63, {inherits: 'iphone', cards: [{}]});
  assert.ok(fs.existsSync(path.join(listing, 'capture.tour.mjs')));
  assert.ok(!fs.existsSync(path.join(listing, 'studio')), 'init no longer copies the studio into the app');
  assert.match(fs.readFileSync(path.join(listing, 'theme.css'), 'utf8'), /\.iphone63 \.big \.device/);
  const result = checkListing(listing);
  assert.deepEqual(result.issues.filter(i => i.level === 'error'), []);
});

test('an iOS recapture runs the tour on each capture profile\'s simulator', async t => {
  const root = temp(t), app = path.join(root, 'app');
  fs.mkdirSync(app);
  const run = spawnSync(process.execPath, [CLI, 'init', app, '--platform', 'ios', '--name', 'Demo', '--package', 'com.example.demo'], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  const listing = path.join(app, 'store-listing');
  const config = json(path.join(listing, 'studio.json'));
  assert.equal(config.capture.platform, 'ios');
  assert.equal(config.capture.install[0].package, 'com.example.demo');
  const lines = [];
  const result = await recapture({listing, dryRun: true, build: false, export: false, log: line => lines.push(line)});
  assert.ok(result.ok, result.error);
  const commands = lines.join('\n');
  assert.match(fs.readFileSync(path.join(listing, 'capture.tour.mjs'), 'utf8'), /app: 'com\.example\.demo'/);
  assert.match(commands, /\$ tour store-listing\/capture\.tour\.mjs --locale en-US --profile iphone,ipad/);
  assert.doesNotMatch(commands, /--profile iphone63|--serial/);
});

test('iOS export --fastlane writes App Store metadata and prefixed screenshots without galleries overwriting each other', async t => {
  const {exportListing} = require('../studio/studio.cjs');
  const root = temp(t), shots = path.join(root, 'shots'), app = path.join(root, 'app');
  fs.mkdirSync(shots); fs.mkdirSync(app);
  // Real PNGs from the demo fixture resized via canvas-free valid 1x1? Use the demo captures or Playwright-created PNGs:
  const {chromium} = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [name, w, h] of [['01-home.png', 1320, 2868], ['02-ipad.png', 2064, 2752]]) {
      const b64 = await page.evaluate(({w, h}) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, w, h);
        return c.toDataURL('image/png').split(',')[1];
      }, {w, h});
      fs.writeFileSync(path.join(shots, name), Buffer.from(b64, 'base64'));
    }
  } finally { await browser.close(); }

  const init = spawnSync(process.execPath, [CLI, 'init', app, '--platform=ios', '--name', 'Demo', '--screenshots', shots], {encoding: 'utf8'});
  assert.equal(init.status, 0, init.stderr);
  const listing = path.join(app, 'store-listing');
  fs.writeFileSync(path.join(listing, 'en-US/copy.json'), JSON.stringify({
    $schema: '../studio/schemas/copy.schema.json',
    home: {title: 'Track *everything*', body: 'Clear updates.'},
    ipad: {title: 'Built for *iPad*', body: 'Room to breathe.'},
  }, null, 2));
  fs.writeFileSync(path.join(listing, 'en-US/listing.json'), JSON.stringify({
    title: 'Demo',
    subtitle: 'Track things easily',
    promotionalText: 'Now on iOS',
    keywords: 'demo,tracker',
    description: 'Full App Store description.',
    whatsNew: 'Initial release.',
  }, null, 2));

  const exported = await exportListing({listing, fastlane: true, log: () => {}});
  assert.equal(exported.ok, true, exported.error);
  const metaDir = path.join(app, 'fastlane/metadata/en-US');
  assert.equal(fs.readFileSync(path.join(metaDir, 'name.txt'), 'utf8'), 'Demo\n');
  assert.equal(fs.readFileSync(path.join(metaDir, 'subtitle.txt'), 'utf8'), 'Track things easily\n');
  assert.equal(fs.readFileSync(path.join(metaDir, 'promotional_text.txt'), 'utf8'), 'Now on iOS\n');
  assert.equal(fs.readFileSync(path.join(metaDir, 'keywords.txt'), 'utf8'), 'demo,tracker\n');
  assert.equal(fs.readFileSync(path.join(metaDir, 'description.txt'), 'utf8'), 'Full App Store description.\n');
  assert.equal(fs.readFileSync(path.join(metaDir, 'release_notes.txt'), 'utf8'), 'Initial release.\n');

  const shotFiles = fs.readdirSync(path.join(app, 'fastlane/screenshots/en-US')).sort();
  assert.deepEqual(shotFiles, ['ipad-1.png', 'iphone-1.png', 'iphone63-1.png']);
});
