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
