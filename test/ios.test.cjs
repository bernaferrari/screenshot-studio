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
  assert.ok(fs.existsSync(path.join(listing, 'capture-simulator.py')));
  assert.ok(!fs.existsSync(path.join(listing, 'studio')), 'init no longer copies the studio into the app');
  assert.match(fs.readFileSync(path.join(listing, 'theme.css'), 'utf8'), /\.iphone63 \.big \.device/);
  const result = checkListing(listing);
  assert.deepEqual(result.issues.filter(i => i.level === 'error'), []);
});

test('an iOS recapture installs on, and captures with, each profile\'s simulator', async t => {
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
  const commands = lines.filter(line => line.startsWith('\n$')).join('\n');
  assert.match(commands, /ios\.py install .*Demo\.app --package com\.example\.demo --simulator/);
  assert.match(commands, /capture-simulator\.py --locale en-US --profile iphone/);
  assert.match(commands, /capture-simulator\.py --locale en-US --profile ipad/);
  assert.doesNotMatch(commands, /--profile iphone63|--serial/);
});
