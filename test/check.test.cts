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

test('schema-invalid profiles and malformed listing text produce diagnostics', () => {
  const listing = fixture(dir => fs.writeFileSync(path.join(dir,'profiles.json'), '{"phone":null}'));
  const result = checkListing(listing);
  assert.equal(result.ok,false);
  assert.ok(result.issues.some(i => i.file === 'profiles.json'));
  const malformed = fixture(dir => fs.writeFileSync(path.join(dir,'en-US/listing.json'), '{'));
  assert.equal(checkListing(malformed).ok,false);
});

test('WebP sizes are read for lossy, lossless and extended headers, including large chunks', () => {
  const {imageSize} = require('../studio/studio.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'studio-webp-'));
  try {
    for (const type of ['VP8 ', 'VP8L', 'VP8X']) {
      const data = Buffer.alloc(70000), width=400,height=800;
      data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WEBP',8); data.write(type,12); data.writeUInt32LE(data.length-20,16);
      if(type==='VP8X'){data.writeUIntLE(width-1,24,3);data.writeUIntLE(height-1,27,3);}
      if(type==='VP8 '){data.set([0x9d,1,0x2a],23);data.writeUInt16LE(width,26);data.writeUInt16LE(height,28);}
      if(type==='VP8L'){data[20]=0x2f;data.writeUInt32LE((width-1)|((height-1)<<14),21);}
      const file=path.join(root,'test.webp');fs.writeFileSync(file,data);
      assert.deepEqual(imageSize(file),{width,height});
    }
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('translation checks exclude reference-only cards and survive broken inheritance', () => {
  const listing=fixture(dir=>{
    edit(path.join(dir,'studio.json'),c=>({...c,locales:['en-US','de-DE']}));
    edit(path.join(dir,'profiles.json'),p=>({...p,readme:{width:600,height:400,frame:'none',defaultLocaleOnly:true}}));
    fs.writeFileSync(path.join(dir,'gallery.json'),JSON.stringify({phone:[{feature:'home'}],readme:[{feature:'hero'}]}));
    fs.writeFileSync(path.join(dir,'en-US/copy.json'),JSON.stringify({home:{title:'Hello',body:''},hero:{title:'README only'}}));
    fs.mkdirSync(path.join(dir,'de-DE'),{recursive:true});
    fs.writeFileSync(path.join(dir,'de-DE/copy.json'),JSON.stringify({home:{title:'Hallo'}}));
  });
  assert.deepEqual(checkListing(listing).issues.filter(i=>i.code==='untranslated'),[]);
  fs.writeFileSync(path.join(listing,'gallery.json'),JSON.stringify({phone:{inherits:'phone',cards:[{}]}}));
  assert.equal(checkListing(listing).ok,false);
});

test('listing.json is checked once per locale against schema and store limits', () => {
  const listing = fixture(dir => {
    fs.writeFileSync(path.join(dir, 'en-US/listing.json'), JSON.stringify({
      $schema: '../studio/schemas/listing.schema.json',
      title: 'A'.repeat(40),
      shortDescription: 'Too long '.repeat(15),
    }));
  });
  const listingIssues = checkListing(listing).issues.filter(i => i.file === 'en-US/listing.json');
  assert.equal(listingIssues.length, 2, 'each limit error is reported once, not duplicated');
  const badSchema = fixture(dir => {
    fs.writeFileSync(path.join(dir, 'en-US/listing.json'), JSON.stringify({title: 123}));
  });
  const schemaIssues = checkListing(badSchema).issues.filter(i => i.file === 'en-US/listing.json' && i.level === 'error');
  assert.equal(schemaIssues.length, 1);
  assert.equal(schemaIssues[0].path, 'title');
});

test('CLI arg parser and Lucide icon parser handle edge cases without eval', () => {
  const {parseCli, parseIntOption, parseListOption, parseLucideSource} = require('../studio/studio.cjs');
  const parsed = parseCli(['--locale=de-DE', '--card=2', '--strict'], {
    locale: {type: 'string'},
    card: {type: 'string'},
    strict: {type: 'boolean'},
  });
  assert.equal(parsed.values.locale, 'de-DE');
  assert.equal(parseIntOption(parsed.values.card, '--card', {min: 0}), 2);
  assert.equal(parsed.values.strict, true);
  assert.deepEqual(parseListOption('en-US, de-DE , '), ['en-US', 'de-DE']);
  assert.throws(() => parseCli(['--unknown'], {strict: {type: 'boolean'}}), /Unknown option/);
  assert.throws(() => parseIntOption('abc', '--jobs', {min: 1}), /must be a whole number/);

  const modSource = `const __iconData = { name: "map", size: 24, node: [["path", { d: "M1 2", key: "k1" }], ["circle", { cx: 12, cy: 12, r: 4, key: "k2" }]] };`;
  assert.equal(parseLucideSource(modSource), '<path d="M1 2"/><circle cx="12" cy="12" r="4"/>');
  const nodeSource = `const __iconNode = [['line', { x1: '1', y1: '2', x2: '3', y2: '4', key: 'k3' }]];`;
  assert.equal(parseLucideSource(nodeSource), '<line x1="1" y1="2" x2="3" y2="4"/>');
  assert.equal(parseLucideSource('<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>', true), '<path d="M0 0h24"/>');
});

test('layers: a missing image or a word the card does not have is an error at its path; translated words pass', () => {
  const listing = fixture(dir => {
    edit(path.join(dir, 'gallery.json'), g => { g.phone[0].layers = [{text: '{number} {kicker}'}, {src: 'assets/none.svg'}, {text: '{nope}'}, {class: 'empty'}]; return g; });
    edit(path.join(dir, 'en-US', 'copy.json'), c => ({...c, home: {...c.home, kicker: 'New'}}));
  });
  const layers = checkListing(listing).issues.filter(i => /layers/.test(i.path || ''));
  assert.deepEqual(layers.map(i => i.path), ['phone[0].layers[1].src', 'phone[0].layers[2].text', 'phone[0].layers[3]']);
  assert.match(layers[1].message, /\{nope\}/);
  assert.match(layers[1].fix, /copy\.json/);
});
