const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {exportListing,recapture}=require('../studio/studio.cjs');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-export-$literal-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const listing=path.join(root,'store-listing');fs.mkdirSync(path.join(listing,'en-US'),{recursive:true});
  const write=(file,value)=>fs.writeFileSync(path.join(listing,file),JSON.stringify(value));
  write('studio.json',{app:'Test',locales:['en-US'],contactSheets:{phone:false},capture:{runs:[{profiles:['tablet']}]}});
  write('profiles.json',{phone:{width:200,height:400,frame:'none',captureWidth:200,captureHeight:400,captureDensity:160},tablet:{width:400,height:600,frame:'none',captureWidth:400,captureHeight:600,captureDensity:160}});
  write('gallery.json',{phone:[{feature:'one'},{feature:'two'}]});write('en-US/copy.json',{});
  fs.writeFileSync(path.join(listing,'theme.css'),'body{background:white}');
  fs.writeFileSync(path.join(listing,'capture.tour.ts'),'export default {app:"test",scenes:{}}');
  return {root,listing,write};
}
test('partial exports preserve manifests, invalid selectors fail, strict failures preserve Fastlane text',async t=>{
  const {root,listing,write}=fixture(t);
  const manifest={galleries:{phone:[{feature:'one'},{feature:'two'}]}};write('en-US/assets.json',manifest);
  const run=options=>exportListing({listing,jobs:1,log:()=>{},...options});
  for(const options of [{card:999},{gallery:'typo'},{card:-1},{card:NaN}]) {
    const result=await run(options);assert.equal(result.ok,false);assert.equal(result.cards.length,0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(listing,'en-US/assets.json'))),manifest);
  }
  const partial=await run({card:0});assert.equal(partial.ok,true,partial.error);assert.equal(partial.cards.length,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(listing,'en-US/assets.json'))),manifest);
  const dest=path.join(root,'fastlane/metadata/android/en-US');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'title.txt'),'Original');
  write('en-US/listing.json',{title:'Changed',shortDescription:'Up to 80 characters',fullDescription:'Description'});
  const failed=await run({card:0,strict:true,fastlane:true});assert.equal(failed.ok,false);assert.match(failed.error,/strict/);
  assert.equal(fs.readFileSync(path.join(dest,'title.txt'),'utf8'),'Original');
  write('en-US/listing.json',{title:'Changed',shortDescription:'A useful app',fullDescription:'Description'});
  const success=await run({card:0,fastlane:true});assert.equal(success.ok,true,success.error);
  assert.equal(fs.readFileSync(path.join(dest,'title.txt'),'utf8'),'Changed\n');
});
test('recapture skips runs excluded by the selected profile and exports literal paths',async t=>{
  const {listing}=fixture(t),lines=[];
  const skipped=await recapture({listing,profile:'phone',dryRun:true,build:false,export:false,log:l=>lines.push(l)});
  assert.equal(skipped.ok,true,skipped.error);assert.ok(!lines.some(l=>l.includes('$ tour')));
  const exported=await recapture({listing,build:false,capture:false,log:()=>{}});
  assert.equal(exported.ok,true,exported.error);
  assert.ok(fs.existsSync(path.join(listing,'en-US/phone/01-one.jpg')));
});

test('export rejects escaping paths, source paths and collisions before writing', async t=>{
  const {root,listing,write}=fixture(t);
  const {checkListing}=require('../studio/studio.cjs');
  for(const file of ['../../outside.png','raw/overwrite.png']) {
    write('gallery.json',{phone:[{feature:'one',file}]});
    assert.equal(checkListing(listing).ok,false);
    const result=await exportListing({listing,log:()=>{}});assert.equal(result.ok,false);assert.match(result.error,/Output/);
  }
  assert.equal(fs.existsSync(path.join(root,'outside.png')),false);
  write('gallery.json',{phone:[{feature:'one',file:'phone/shared.png'},{feature:'two',file:'phone/shared.png'}]});
  assert.equal(checkListing(listing).ok,false);
  assert.match((await exportListing({listing,log:()=>{}})).error,/unique path/);
  write('gallery.json',{phone:[{feature:'one',file:'phone/alias.png'}]});
  fs.mkdirSync(path.join(listing,'en-US/phone'));fs.symlinkSync(root,path.join(listing,'en-US/phone/link'));
  write('gallery.json',{phone:[{feature:'one',file:'phone/link/escaped.png'}]});
  assert.equal((await exportListing({listing,log:()=>{}})).ok,false);
  fs.symlinkSync(path.join(root,'missing'),path.join(listing,'en-US/phone/broken'));
  write('gallery.json',{phone:[{feature:'one',file:'phone/broken/escaped.png'}]});
  assert.equal(checkListing(listing).ok,false);
  assert.equal((await exportListing({listing,log:()=>{}})).ok,false);
  write('gallery.json',{phone:[{feature:'one',file:'phone/one.jpg'},{feature:'two',file:'phone/two.jpg'}]});
  write('studio.json',{app:'Test',locales:['en-US'],contactSheets:{phone:'phone/one.jpg'}});
  assert.match((await exportListing({listing,log:()=>{}})).error,/unique path/);
  write('studio.json',{app:'Test',locales:['en-US'],readmeStrips:[{kind:'phone',cards:[0],file:'../strip.jpg'}]});
  assert.equal((await exportListing({listing,log:()=>{}})).ok,false);
});

test('text that blends into what is behind it is a warning; the same card with readable text is not', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-contrast-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const listing = path.join(root, 'store-listing');
  fs.cpSync(path.join(__dirname, 'fixtures', 'golden'), listing, {recursive: true});
  const theme = path.join(__dirname, '..', 'themes', 'starter');
  for (const file of ['theme.css', 'theme.ts']) fs.copyFileSync(path.join(theme, file), path.join(listing, file));
  const run = () => exportListing({listing, locales: ['en-US'], gallery: 'phone', card: 0, jobs: 1, log: () => {}});
  const readable = await run();
  assert.equal(readable.ok, true, readable.error);
  assert.deepEqual(readable.warnings.filter(w => /hard to read/.test(w)), []);
  // The highlight in nearly the background's own color.
  fs.appendFileSync(path.join(listing, 'theme.css'), '\nh1 em{color:#e9ecf8}\n');
  const faint = await run();
  const warnings = faint.warnings.filter(w => /hard to read/.test(w));
  assert.equal(warnings.length, 1, faint.warnings.join('\n'));
  assert.match(warnings[0], /contrast 1\.\d:1, needs at least 2\.5:1/);
  // Text painted with -webkit-text-fill-color is measured in that color: a readable fill is fine whatever `color` says.
  fs.appendFileSync(path.join(listing, 'theme.css'), '\nh1 em{-webkit-text-fill-color:#2747d8}\n');
  assert.deepEqual((await run()).warnings.filter(w => /hard to read/.test(w)), []);
  // Deliberately faint text (a watermark) and aria-hidden text are decoration, not copy.
  fs.appendFileSync(path.join(listing, 'theme.css'), '\nheader p{opacity:.12}\nh1 em{-webkit-text-fill-color:#e9ecf8}\n');
  const decorated = await run();
  const flagged = decorated.warnings.filter(w => /hard to read/.test(w));
  assert.equal(flagged.length, 1, decorated.warnings.join('\n'));
  assert.doesNotMatch(flagged[0], /Deadline|Watch|page/);
});

test('--depth draws devices in 3D: the 3d and tilt words turn it on, flat turns it off, and CSS sets it anywhere', {timeout: 180_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-depth-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const listing = path.join(root, 'store-listing');
  fs.cpSync(path.join(__dirname, 'fixtures', 'golden'), listing, {recursive: true});
  const theme = path.join(__dirname, '..', 'themes', 'starter');
  for (const file of ['theme.css', 'theme.ts']) fs.copyFileSync(path.join(theme, file), path.join(listing, file));
  const galleryFile = path.join(listing, 'gallery.json'), gallery = JSON.parse(fs.readFileSync(galleryFile, 'utf8'));
  const css = fs.readFileSync(path.join(listing, 'theme.css'), 'utf8');
  const render = async (layout, extraCss = '') => {
    gallery.phone[0].layout = layout;
    fs.writeFileSync(galleryFile, JSON.stringify(gallery));
    fs.writeFileSync(path.join(listing, 'theme.css'), css + extraCss);
    const result = await exportListing({listing, locales: ['en-US'], gallery: 'phone', card: 0, jobs: 1, log: () => {}});
    assert.equal(result.ok, true, result.error);
    return fs.readFileSync(path.join(listing, result.cards[0].file));
  };
  const flat = await render('big');
  const deep = await render('big 3d');
  assert.notDeepEqual(deep, flat, 'the 3d word draws the phone in 3D');
  assert.deepEqual(await render('big 3d flat'), flat, 'flat keeps the flat frame');
  assert.deepEqual(await render('big', '\n.device{--depth:1}\n'), deep, 'a theme turns it on with --depth');
  assert.deepEqual(await render('big flat', '\n.device{--depth:1}\n'), flat, 'flat wins over the theme');
  // Turned, the side shows: a tilted device is 3D on its own, and a bigger --depth is a thicker one.
  const tilted = await render('big tilt');
  assert.notDeepEqual(tilted, await render('big tilt flat'), 'tilt draws the phone in 3D');
  assert.notDeepEqual(await render('big tilt', '\n.device{--depth:3}\n'), tilted, 'a bigger --depth is a thicker device');
});

test('a line break the copy asks for is the writer\'s: the short line after it is not a widow', {timeout: 120_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-break-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const listing = path.join(root, 'store-listing');
  fs.cpSync(path.join(__dirname, 'fixtures', 'golden'), listing, {recursive: true});
  const theme = path.join(__dirname, '..', 'themes', 'starter');
  for (const file of ['theme.css', 'theme.ts']) fs.copyFileSync(path.join(theme, file), path.join(listing, file));
  fs.appendFileSync(path.join(listing, 'theme.css'), '\nheader p{white-space:pre-line}\n');
  const copyFile = path.join(listing, 'en-US', 'copy.json'), copy = JSON.parse(fs.readFileSync(copyFile, 'utf8'));
  copy.home.body = 'Every page you watch, checked in the background.\nNo account.';
  fs.writeFileSync(copyFile, JSON.stringify(copy));
  const result = await exportListing({listing, locales: ['en-US'], gallery: 'phone', card: 0, jobs: 1, log: () => {}});
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.warnings.filter(w => /short last line/.test(w)), []);
});

test('--card takes a card by its feature name, and a wrong one lists the cards there are', {timeout: 120_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-card-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const listing = path.join(root, 'store-listing');
  fs.cpSync(path.join(__dirname, 'fixtures', 'golden'), listing, {recursive: true});
  const theme = path.join(__dirname, '..', 'themes', 'starter');
  for (const file of ['theme.css', 'theme.ts']) fs.copyFileSync(path.join(theme, file), path.join(listing, file));
  const features = JSON.parse(fs.readFileSync(path.join(listing, 'gallery.json'), 'utf8')).phone.map(card => card.feature);
  const byName = await exportListing({listing, locales: ['en-US'], gallery: 'phone', card: features[1], jobs: 1, log: () => {}});
  assert.equal(byName.ok, true, byName.error);
  assert.deepEqual(byName.cards.map(card => [card.index, card.feature]), [[1, features[1]]]);
  const wrong = await exportListing({listing, locales: ['en-US'], gallery: 'phone', card: 'nope', jobs: 1, log: () => {}});
  assert.match(wrong.error, new RegExp(`No card "nope" in phone\\. Its cards: ${features.join(', ')}`));
  const noGallery = await exportListing({listing, locales: ['en-US'], card: features[0], jobs: 1, log: () => {}});
  assert.match(noGallery.error, /say which gallery with --gallery/);
});
