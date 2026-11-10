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
  fs.writeFileSync(path.join(listing,'capture.tour.mjs'),'export default {app:"test",scenes:{}}');
  return {root,listing,write};
}
test('partial exports preserve manifests, invalid selectors fail, strict failures preserve Fastlane text',async t=>{
  const {root,listing,write}=fixture(t);
  const manifest={galleries:{phone:[{feature:'one'},{feature:'two'}]}};write('en-US/assets.json',manifest);
  const run=options=>exportListing({listing,jobs:1,log:()=>{},...options});
  for(const options of [{card:999},{kind:'typo'},{card:-1},{card:NaN}]) {
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
