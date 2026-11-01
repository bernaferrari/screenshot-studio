// Golden images: every theme renders the same fixture cards (big, a callout, hang, duo, the feature graphic), and each
// card must still look like its reference in test/golden/<theme>/. Refactors of the renderer, export or themes are
// safe as long as these pass. After an intended visual change, regenerate them and look at the diff:
//   UPDATE_GOLDEN=1 npm run test:golden
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {exportListing} = require('../studio/studio.cjs');
const {chromium} = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'golden');
const GOLDEN = path.join(__dirname, 'golden');
const UPDATE = !!process.env.UPDATE_GOLDEN;
/** Compared at this width, so font anti-aliasing differences between machines wash out. */
const WIDTH = 360;
/** A card fails when more than this share of its pixels differ visibly. */
const TOLERANCE = 0.01;

const themes = fs.readdirSync(path.join(ROOT, 'themes')).filter(t => fs.existsSync(path.join(ROOT, 'themes', t, 'theme.css'))).sort();

/** A temporary app: the fixture listing dressed in one theme. */
function project(theme) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), `golden-${theme}-`));
  const listing = path.join(app, 'store-listing');
  fs.cpSync(FIXTURE, listing, {recursive: true});
  const from = path.join(ROOT, 'themes', theme);
  for (const file of ['theme.css', 'theme.js']) {
    if (fs.existsSync(path.join(from, file))) fs.writeFileSync(path.join(listing, file), fs.readFileSync(path.join(from, file), 'utf8').replaceAll('{{name}}', 'Demo'));
  }
  if (fs.existsSync(path.join(from, 'assets'))) fs.cpSync(path.join(from, 'assets'), path.join(listing, 'assets'), {recursive: true});
  return {app, listing};
}

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });

/**
 * Scale an image to WIDTH, encode it as the goldens are stored (JPEG), and return that JPEG and its RGBA pixels, so a
 * new render and its golden go through the same encoding before they are compared.
 */
async function pixels(file) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({data, width}) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const height = Math.round(image.naturalHeight * width / image.naturalWidth);
      const canvas = Object.assign(document.createElement('canvas'), {width, height});
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);
      const jpeg = canvas.toDataURL('image/jpeg', 0.9);
      const encoded = new Image();
      encoded.src = jpeg;
      await encoded.decode();
      context.drawImage(encoded, 0, 0);
      return {width, height, rgba: Array.from(context.getImageData(0, 0, width, height).data), jpeg: jpeg.split(',')[1]};
    }, {data: `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(file).toString('base64')}`, width: WIDTH});
  } finally { await page.close(); }
}

/** The share of pixels whose largest channel difference is visible. */
function difference(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let bad = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
    if (d > 40) bad++;
  }
  return bad / (a.rgba.length / 4);
}

for (const theme of themes) {
  test(`${theme}: every card matches its golden image`, {timeout: 180_000}, async () => {
    const {app, listing} = project(theme);
    try {
      const result = await exportListing({listing, locales: ['en-US'], log: () => {}});
      assert.ok(result.ok, `${theme} failed to export: ${result.error}`);
      assert.equal(result.warnings.length, 0, `${theme} export warnings:\n${result.warnings.join('\n')}`);
      const failures = [];
      for (const card of result.cards) {
        const name = card.file.replace(/^en-US\//, '').replace(/[/\\]/g, '__').replace(/\.(jpe?g|png)$/, '.jpg');
        const golden = path.join(GOLDEN, theme, name);
        const actual = await pixels(path.join(listing, card.file));
        if (UPDATE || !fs.existsSync(golden)) {
          fs.mkdirSync(path.dirname(golden), {recursive: true});
          fs.writeFileSync(golden, Buffer.from(actual.jpeg, 'base64'));
          continue;
        }
        const share = difference(actual, await pixels(golden));
        if (share > TOLERANCE) {
          const out = path.join(os.tmpdir(), 'golden-failures', theme, name);
          fs.mkdirSync(path.dirname(out), {recursive: true});
          fs.writeFileSync(out, Buffer.from(actual.jpeg, 'base64'));
          failures.push(`${name}: ${(share * 100).toFixed(1)}% of pixels differ (new render: ${out})`);
        }
      }
      assert.deepEqual(failures, [], `${theme} no longer matches its golden images:\n${failures.join('\n')}`);
    } finally { fs.rmSync(app, {recursive: true, force: true}); }
  });
}
