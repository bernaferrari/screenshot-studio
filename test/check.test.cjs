// check: store limits and starter words, on a copy of the golden fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {checkListing} = require('../studio/studio.cjs');

function fixture(change) {
  const listing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-check-')), 'store-listing');
  fs.cpSync(path.join(__dirname, 'fixtures', 'golden'), listing, {recursive: true});
  fs.writeFileSync(path.join(listing, 'theme.css'), '');
  change(listing);
  return listing;
}
const edit = (file, fn) => fs.writeFileSync(file, JSON.stringify(fn(JSON.parse(fs.readFileSync(file, 'utf8')))));

test('a Play gallery with more than 8 cards is flagged; README art is not', () => {
  const listing = fixture(dir => edit(path.join(dir, 'gallery.json'), g => ({...g, phone: Array.from({length: 9}, () => g.phone[0])})));
  const limits = checkListing(listing).issues.filter(i => i.code === 'store-limit');
  assert.equal(limits.length, 1);
  assert.match(limits[0].message, /"phone" has 9 cards; Google Play takes at most 8/);
  assert.equal(checkListing(fixture(() => {})).issues.filter(i => i.code === 'store-limit').length, 0);
});

test('starter words are flagged with a fix that fits the field', () => {
  const listing = fixture(dir => edit(path.join(dir, 'en-US', 'copy.json'), c => ({...c, home: {title: 'Your headline\nabout *home*', body: 'One short line on why it matters.'}})));
  const found = checkListing(listing).issues.filter(i => i.code === 'placeholder');
  assert.deepEqual(found.map(i => i.path).sort(), ['home.body', 'home.title']);
  assert.match(found.find(i => i.path === 'home.body').fix, /backs the headline up/);
});
