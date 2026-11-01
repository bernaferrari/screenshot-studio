// Builds the README images from the apps that use the studio (their own exports and captures).
//   PLAYWRIGHT_MODULE=… node docs/images/make.cjs [--apps ~/Documents/android] [--editor]
// --editor also screenshots the workspace and a project's cards, on a studio server started with a temporary
// project registry (your own registry is left alone).
const fs = require('fs');
const path = require('path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const APPS = path.resolve(arg('apps', path.join(process.env.HOME, 'Documents/android')));
const OUT = __dirname;
const file = rel => {
  const p = path.join(APPS, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return `data:image/${p.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(p).toString('base64')}`;
};

// One Play card per app: seven apps, seven looks, one workflow.
const CARDS = [
  'SDKMonitor/store-listing/en-US/phone/phone-01-apps.jpg',
  'Calcula/store-listing/en-US/phone/phone-01-every-key.jpg',
  'Keepout/store-listing/en-US/phone/phone-01-home.jpg',
  'WiFiWeakspot/store-listing/en-US/screenshots/v10-01-channels.jpg',
  'QuietGuard/store-listing/en-US/phone/phone-01-home.jpg',
  'ChangeDetection/store-listing/en-US/phone/v2-01-home.jpg',
  'Wordkeep/store-listing/en-US/phone/01-home.jpg',
];
const README_ART = [
  'Calcula/store-listing/en-US/readme/tools.jpg',
  'SDKMonitor/store-listing/en-US/readme/before-after.jpg',
  'QuietGuard/store-listing/en-US/readme/rules.jpg',
  'Keepout/store-listing/en-US/readme/hero.jpg',
];

const FONT = `font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif`;
const page = body => `<!doctype html><html><body style="margin:0;${FONT};-webkit-font-smoothing:antialiased">${body}</body></html>`;

const hero = () => page(`
<div style="width:2400px;height:1200px;position:relative;overflow:hidden;background:linear-gradient(180deg,#f7f7f9,#eceef3)">
  <div style="position:absolute;top:110px;left:0;right:0;text-align:center">
    <div style="font-size:112px;font-weight:750;letter-spacing:-.035em;color:#15161a">Screenshot Studio</div>
    <div style="margin-top:22px;font-size:44px;color:#5b5f6b">Real app screens in. Store and README art out.</div>
  </div>
  <div style="position:absolute;left:0;right:0;top:470px;display:flex;justify-content:center;gap:36px">
    ${CARDS.map((c, i) => `<img src="${file(c)}" style="width:300px;border-radius:26px;box-shadow:0 30px 60px -28px #1b1f2e66,0 0 0 1px #0000000d;transform:translateY(${[60, 20, 0, -10, 0, 20, 60][i]}px) rotate(${[-6, -4, -2, 0, 2, 4, 6][i]}deg)">`).join('')}
  </div>
</div>`);

const steps = () => {
  const step = (n, title, sub, img, w, extra = '') => `<div style="display:flex;flex-direction:column;align-items:center;gap:26px">
    <img src="${img}" style="width:${w}px;border-radius:24px;box-shadow:0 26px 50px -26px #1b1f2e66,0 0 0 1px #0000000f;${extra}">
    <div style="text-align:center"><div style="font-size:40px;font-weight:700;color:#15161a"><span style="color:#5b6cff">${n}</span>&nbsp; ${title}</div>
    <div style="margin-top:8px;font-size:28px;color:#5b5f6b">${sub}</div></div></div>`;
  const arrow = `<div style="font-size:72px;color:#b4b8c4;margin-top:-120px">→</div>`;
  return page(`<div style="width:2400px;height:1100px;background:linear-gradient(180deg,#f7f7f9,#eceef3);display:flex;align-items:center;justify-content:center;gap:56px">
    ${step(1, 'Capture', 'The real app, on an emulator', file('Keepout/store-listing/en-US/raw/phone/01-home.png'), 340)}${arrow}
    ${step(2, 'Compose', 'Your theme in HTML and CSS', file('Keepout/store-listing/en-US/phone/phone-01-home.jpg'), 440)}${arrow}
    ${step(3, 'Export', 'Play, fastlane and README art', file('Keepout/store-listing/en-US/readme/hero.jpg'), 900)}
  </div>`);
};

const readmeArt = () => page(`<div style="width:2400px;padding:60px;box-sizing:border-box;background:#eceef3;display:grid;grid-template-columns:1fr 1fr;gap:40px">
  ${README_ART.map(a => `<img src="${file(a)}" style="width:100%;border-radius:22px;box-shadow:0 20px 40px -24px #1b1f2e55">`).join('')}
</div>`);

(async () => {
  const b = await chromium.launch();
  for (const [name, html, w] of [['hero', hero(), 2400], ['how-it-works', steps(), 2400], ['readme-art', readmeArt(), 2400]]) {
    const p = await b.newPage({viewport: {width: w, height: 800}});
    await p.setContent(html);
    await p.waitForLoadState('networkidle');
    const shot = await p.screenshot({fullPage: true, type: 'jpeg', quality: 86});
    fs.writeFileSync(path.join(OUT, `${name}.jpg`), shot);
    console.log(`${name}.jpg`);
  }
  if (process.argv.includes('--editor')) await editor(b);
  await b.close();
})();

async function editor(browser) {
  const {spawn} = require('child_process');
  const registry = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'studio-')), 'projects.json');
  const apps = ['SDKMonitor', 'Calcula', 'Keepout', 'QuietGuard', 'ChangeDetection', 'Wordkeep', 'WiFiWeakspot'];
  const server = spawn('node', [path.join(__dirname, '../../studio/server.cjs'), '8797', '--registry', registry,
    ...apps.flatMap(app => ['--add', path.join(APPS, app)])], {stdio: 'ignore'});
  try {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const p = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 2, colorScheme: 'light'});
    await p.goto('http://127.0.0.1:8797/studio/');
    await p.waitForTimeout(9000);
    fs.writeFileSync(path.join(OUT, 'editor-projects.jpg'), await p.screenshot({type: 'jpeg', quality: 86}));
    await p.getByRole('link', {name: /SDK Monitor/}).first().click();
    await p.waitForTimeout(4000);
    await p.getByRole('link', {name: /^Cards$/}).first().click();
    await p.waitForTimeout(9000);
    fs.writeFileSync(path.join(OUT, 'editor-cards.jpg'), await p.screenshot({type: 'jpeg', quality: 86}));
    console.log('editor-projects.jpg\neditor-cards.jpg');
  } finally { server.kill(); }
}
