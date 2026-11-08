// init: screenshots in every language land on the same cards, with empty fields to translate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {checkListing} = require('../studio/studio.cjs');

const STUDIO = path.join(__dirname, '..', 'studio', 'studio.cjs');
const DEMO = path.join(__dirname, '..', 'templates', 'demo');

test('init finds fastlane screenshots in every language and maps them onto one set of cards', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-init-'));
  try {
    for (const locale of ['en-US', 'de-DE', 'zh-CN']) {
      const folder = path.join(app, 'fastlane/metadata/android', locale, 'images/phoneScreenshots');
      fs.mkdirSync(folder, {recursive: true});
      for (const [i, file] of fs.readdirSync(path.join(DEMO, locale, 'raw/phone')).sort().entries()) fs.copyFileSync(path.join(DEMO, locale, 'raw/phone', file), path.join(folder, `${i + 1}.jpg`));
    }
    const run = spawnSync(process.execPath, [STUDIO, 'init', '--name', 'Demo'], {cwd: app, encoding: 'utf8'});
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /Translate them into the empty fields of de-DE\/copy.json, zh-CN\/copy.json/);
    const listing = path.join(app, 'store-listing');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(listing, 'studio.json'), 'utf8')).locales, ['en-US', 'de-DE', 'zh-CN']);
    const raws = fs.readdirSync(path.join(listing, 'en-US/raw/phone')).sort();
    for (const locale of ['de-DE', 'zh-CN']) {
      assert.deepEqual(fs.readdirSync(path.join(listing, locale, 'raw/phone')).sort(), raws, `${locale} has the same captures`);
      assert.ok(fs.readFileSync(path.join(listing, locale, 'raw/phone', raws[0])).equals(fs.readFileSync(path.join(app, 'fastlane/metadata/android', locale, 'images/phoneScreenshots/1.jpg'))), `${locale}'s own screen`);
      const copy = JSON.parse(fs.readFileSync(path.join(listing, locale, 'copy.json'), 'utf8'));
      assert.ok(Object.entries(copy).filter(([key]) => key !== '$schema').every(([, entry]) => Object.values(entry).every(text => text === '')), `${locale} fields are empty`);
    }
    const untranslated = checkListing(listing).issues.filter(issue => issue.code === 'untranslated');
    assert.deepEqual(untranslated.map(issue => issue.file).sort(), ['de-DE/copy.json', 'zh-CN/copy.json']);
  } finally { fs.rmSync(app, {recursive: true, force: true}); }
});

test('init imports a single WebP screenshot from a folder', async t => {
  const {chromium}=require('playwright');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-single-webp-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const browser=await chromium.launch();
  let data;
  try {
    const page=await browser.newPage();
    data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=800;return c.toDataURL('image/webp').split(',')[1];});
  } finally {await browser.close();}
  const shots=path.join(root,'shots');fs.mkdirSync(shots);fs.writeFileSync(path.join(shots,'01-home.webp'),Buffer.from(data,'base64'));
  const app=path.join(root,'app');
  const run=spawnSync(process.execPath,[STUDIO,'init',app,'--screenshots',shots],{encoding:'utf8'});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const listing=path.join(app,'store-listing');
  const gallery=JSON.parse(fs.readFileSync(path.join(listing,'gallery.json')));
  assert.match(gallery.phone[0].raw,/\.webp$/);
  assert.equal(checkListing(listing).ok,true);
});
