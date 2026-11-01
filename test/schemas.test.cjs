const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.join(__dirname, '..');

test('schemas/ matches the types it is generated from', () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/schemas.mjs'), '--check'], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
});

test('studio/ ships the current schemas', () => {
  for (const file of fs.readdirSync(path.join(ROOT, 'schemas'))) {
    assert.equal(fs.readFileSync(path.join(ROOT, 'studio/schemas', file), 'utf8'), fs.readFileSync(path.join(ROOT, 'schemas', file), 'utf8'), `studio/schemas/${file} is stale: run \`npm run build\``);
  }
});
