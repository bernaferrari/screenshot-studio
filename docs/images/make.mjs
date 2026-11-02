// The README's art. From the real exported cards of the apps that use the studio: hero.jpg, before-after.jpg,
// themes.jpg, depth.jpg, callouts.jpg and readme-art.jpg. With --editor, from the editor open on a fresh `demo` project: editor-store.jpg and
// editor-languages.jpg (for docs/editor.md) and demo.gif, the cards re-rendering live as the theme changes on disk (ffmpeg makes the GIF).
//   node docs/images/make.mjs [hero before-after …] [--editor]   (APPS=~/Documents/android: the apps whose cards it shows)
// Run `npm run build` first. The editor runs on a temporary home and project list; yours are left alone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const root = path.resolve(import.meta.dirname, '..', '..');
const studio = path.join(root, 'studio/studio.cjs');
const apps = process.env.APPS || path.join(os.homedir(), 'Documents', 'android');
const out = path.join(root, 'docs', 'images');
const listing = app => path.join(apps, app, 'store-listing');
const image = file => `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(file).toString('base64')}`;

const page = `*{box-sizing:border-box;margin:0}
body{background:#f3f4f7;color:#15172b;font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;position:relative;overflow:hidden}
.card{position:absolute;border-radius:28px;box-shadow:0 0 0 1px #15172b10,0 40px 90px -30px #15172b70}`;

async function shoot(browser, html, width, height, file) {
  const tab = await browser.newPage({viewport: {width, height}});
  await tab.setContent(`<!doctype html><meta charset=utf-8><style>${page}body{width:${width}px;height:${height}px}</style>${html}`);
  await tab.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await tab.screenshot({path: path.join(out, file), type: 'jpeg', quality: 86});
  await tab.close();
  console.log(`docs/images/${file}`);
}

/** Apps' first Play cards, large, in a gentle arc running off the sides and the bottom, under the name. */
function hero() {
  // Five apps, each its own color, with a gap between them so every headline reads whole; the edges get headlines
  // that sit clear of the cut (QuietGuard's is centered).
  const cards = [
    ['QuietGuard', 'en-US/phone/phone-01-home.jpg'], ['ChangeDetection', 'en-US/phone/v2-01-home.jpg'], ['Keepout', 'en-US/phone/phone-01-home.jpg'],
    ['Calcula', 'en-US/phone/phone-01-every-key.jpg'], ['Wordkeep', 'en-US/phone/01-home.jpg'],
  ];
  const W = 2400, width = 470;
  const fan = cards.map(([app, file], i) => {
    const d = i - 2;
    const style = `left:${W / 2 + d * 500 - width / 2}px;top:${468 + d * d * 26}px;width:${width}px;transform:rotate(${d * 2}deg);z-index:${10 - Math.abs(d)}`;
    return `<img class="card" style="${style}" src="${image(path.join(listing(app), file))}">`;
  }).join('');
  // The name beside the studio's icon (docs/brand/).
  return [`<h1 style="position:absolute;top:84px;width:100%;display:flex;justify-content:center;align-items:center;gap:44px;font-size:156px;font-weight:800;letter-spacing:-.04em"><img src="${image(path.join(root, 'docs/brand/icon.png'))}" style="width:168px;height:168px;filter:drop-shadow(0 18px 30px #3341c440)">Screenshot Studio</h1>
<p style="position:absolute;top:286px;width:100%;text-align:center;font-size:56px;color:#5b5f73;letter-spacing:-.01em">Real app screens in. Store and README art out.</p>${fan}`, W, 1186];
}

/**
 * The finished set leads: three headline-first cards, large. Before them, small, the plain captures they came from;
 * under them the same first card in three more languages, each from that language's own screens.
 */
function beforeAfter() {
  // Calcula's README showcase: its first three scenes in one palette, on one warm family of blocks.
  const app = listing('Calcula');
  const raws = ['01-every-key', '10-graph-amber', '11-convert-amber'].map(n => image(path.join(app, 'en-US/raw/phone', `${n}.png`)));
  const cards = ['01-every-key', '02-graph', '03-convert'].map(n => image(path.join(app, 'en-US/showcase', `${n}.jpg`)));
  const langs = [['de-DE', 'Deutsch'], ['zh-CN', '中文'], ['ja-JP', '日本語']]
    .map(([locale, name]) => [image(path.join(app, locale, 'showcase/02-graph.jpg')), name]);
  const W = 2400, H = 1420, cardW = 470, gap = 26, left = W - 80 - 3 * cardW - 2 * gap;
  // A loose pile of plain screenshots, as they come off the device.
  const raw = (src, i) => `<img src="${src}" style="position:absolute;left:${86 + i * 168}px;top:${300 + [10, 0, 26][i]}px;width:236px;border-radius:16px;transform:rotate(${[-6, 1, 7][i]}deg);box-shadow:0 0 0 1px #15172b1c,0 18px 40px -18px #15172b70">`;
  const card = (src, i) => `<img class="card" src="${src}" style="left:${left + i * (cardW + gap)}px;top:190px;width:${cardW}px;border-radius:30px">`;
  // The languages run off the bottom: their headlines and the top of the app are the point.
  const lang = ([src, name], i) => `<p style="position:absolute;left:${left + i * (cardW + gap)}px;top:1092px;font-size:30px;font-weight:650;color:#5b5f73">${name}</p>
<img class="card" src="${src}" style="left:${left + i * (cardW + gap)}px;top:1146px;width:${cardW}px;border-radius:30px">`;
  const label = (x, bold, text) => `<p style="position:absolute;left:${x}px;top:110px;font-size:36px;font-weight:600;color:#5b5f73"><b style="color:#15172b;font-weight:750">${bold}</b> ${text}</p>`;
  return [`${label(80, 'Before:', 'your screenshots')}${label(left, 'After:', 'a Google Play set, checked')}
${raws.map(raw).join('')}${cards.map(card).join('')}
<svg style="position:absolute;left:${left - 150}px;top:520px" width="110" height="60" viewBox="0 0 110 60"><path d="M6 30H96M74 8l26 22-26 22" fill="none" stroke="#4150d0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
<p style="position:absolute;left:80px;top:880px;font-size:54px;font-weight:780;letter-spacing:-.03em;line-height:1.08">The same set in<br>every language,<br><span style="color:#4150d0">the app's own<br>screens too.</span></p>
<p style="position:absolute;left:80px;top:1150px;width:${left - 230}px;font-size:30px;line-height:1.38;color:#5b5f73">Captured in each language, laid out by one theme, every card checked: copy that doesn't fit, devices off the card, store limits.</p>
${langs.map(lang).join('')}`, W, H];
}

/** The demo's text card in each theme, side by side, labelled, all cut by the stage at one line. */
function themes() {
  const names = ['aurora', 'porcelain', 'signal', 'paper', 'panels', 'mono'];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-themes-'));
  const cards = names.map(theme => {
    const run = spawnSync(process.execPath, [studio, 'demo', theme, '--theme', theme, '--no-open'], {cwd: work, encoding: 'utf8'});
    if (run.status !== 0) throw new Error(`demo --theme ${theme} failed:\n${run.stdout}${run.stderr}`);
    return image(path.join(work, theme, 'store-listing/en-US/phone/03-text.jpg'));
  });
  fs.rmSync(work, {recursive: true, force: true});
  const html = names.map((name, i) => `<p style="position:absolute;left:${48 + i * 392}px;top:44px;font-size:36px;font-weight:650;letter-spacing:-.01em">${name}</p>
<img class="card" src="${cards[i]}" style="left:${48 + i * 392}px;top:112px;width:360px;border-radius:24px">`).join('');
  // Just under the first block of the app's screen, the same line on every card.
  return [html, 2400, 552];
}

/** The demo with --3d: its cards as real 3D phones, tilted, in porcelain, cut by the stage under their headlines. */
function depth() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-depth-'));
  const run = spawnSync(process.execPath, [studio, 'demo', 'd', '--theme', 'porcelain', '--3d', '--no-open'], {cwd: work, encoding: 'utf8'});
  if (run.status !== 0) throw new Error(`demo --3d failed:\n${run.stdout}${run.stderr}`);
  const cards = ['02-restock', '01-page', '03-text'].map(n => image(path.join(work, 'd/store-listing/en-US/phone', `${n}.jpg`)));
  fs.rmSync(work, {recursive: true, force: true});
  return [cards.map((src, i) => `<img class="card" src="${src}" style="left:${120 + i * 740}px;top:70px;width:680px;border-radius:32px">`).join(''), 2400, 880];
}

/**
 * A callout picked from the capture's accessibility tree, on the demo's restock card in three languages: the same
 * element lifted out and magnified in each, wherever it sits.
 */
function callouts() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-callouts-')), at = path.join(work, 'store-listing');
  fs.cpSync(path.join(root, 'templates/demo'), at, {recursive: true});
  const locales = [['en-US', 'English'], ['de-DE', 'Deutsch'], ['zh-CN', '中文']];
  for (const [locale] of locales) for (const ext of ['png', 'nodes.json'])
    fs.copyFileSync(path.join(listing('ChangeDetection'), locale, `raw/phone/light/02b-compare-restock.${ext}`), path.join(at, locale, `raw/phone/restock.${ext}`));
  for (const file of ['theme.css', 'theme.js']) fs.writeFileSync(path.join(at, file), fs.readFileSync(path.join(root, 'themes/aurora', file), 'utf8').replaceAll('{{name}}', 'ChangeDetection'));
  fs.cpSync(path.join(root, 'themes/aurora/assets'), path.join(at, 'assets'), {recursive: true});
  const profiles = JSON.parse(fs.readFileSync(path.join(at, 'profiles.json'), 'utf8'));
  Object.assign(profiles.phone, {captureWidth: 1080, captureHeight: 2340});
  fs.writeFileSync(path.join(at, 'profiles.json'), JSON.stringify(profiles));
  // The first change on the page, by its place in the UI tree: "Sold out" before, "In stock" after.
  fs.writeFileSync(path.join(at, 'gallery.json'), JSON.stringify({phone: [{feature: 'restock', raw: 'phone/restock.png', layout: 'big',
    callouts: [{x: 147, y: 516, w: 912, h: 391, target: '0.0.0.0.0.0.0.0.0.2.3.1', targetMode: 'element', mag: 1.18, radius: 34}]}]}));
  const run = spawnSync(process.execPath, [studio, 'export', '--listing', at], {encoding: 'utf8'});
  if (run.status !== 0) throw new Error(`callout export failed:\n${run.stdout}${run.stderr}`);
  const cards = locales.map(([locale, name]) => [image(path.join(at, locale, 'phone/01-restock.jpg')), name]);
  fs.rmSync(work, {recursive: true, force: true});
  const html = `<p style="position:absolute;left:80px;top:300px;width:760px;font-size:76px;font-weight:780;letter-spacing:-.035em;line-height:1.05">Lift out what<br><span style="color:#4150d0">matters.</span></p>
<p style="position:absolute;left:80px;top:500px;width:720px;font-size:36px;line-height:1.38;color:#5b5f73">Pick a UI element from the capture's accessibility tree. The callout lifts it out, magnified, and follows it into every language, wherever the translation moves it.</p>
${cards.map(([src, name], i) => `<p style="position:absolute;left:${900 + i * 500}px;top:56px;font-size:32px;font-weight:650;color:#5b5f73">${name}</p>
<img class="card" src="${src}" style="left:${900 + i * 500}px;top:120px;width:460px;border-radius:26px">`).join('')}`;
  return [html, 2400, 905];
}

/** README art from four apps, two by two: each app's own README image, whole. */
function readmeArt() {
  const tiles = [['Calcula', 'tools.jpg'], ['WiFiWeakspot', 'tools.jpg'], ['Wordkeep', 'hero.jpg'], ['Lumina', 'hero.jpg']];
  const width = 1120, height = Math.round(width * 1260 / 2400);
  const html = tiles.map(([app, file], i) => `<img class="card" src="${image(path.join(listing(app), 'en-US/readme', file))}" style="left:${60 + (i % 2) * (width + 40)}px;top:${60 + Math.floor(i / 2) * (height + 40)}px;width:${width}px;height:${height}px;object-fit:cover;border-radius:24px">`).join('');
  return [html, 2400, 60 * 2 + height * 2 + 40];
}

/** The editor on a fresh demo, shown as ~/code/ChangeDetection: its store preview, its languages, and the live GIF. */
async function editor(browser) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-editor-')), code = path.join(home, 'code');
  fs.mkdirSync(code);
  spawnSync(process.execPath, [studio, 'demo', 'ChangeDetection', '--no-open'], {cwd: code});
  const project = path.join(code, 'ChangeDetection'), listing = path.join(project, 'store-listing');
  const port = 8790 + Math.floor(Math.random() * 100);
  const server = spawn(process.execPath, [studio, 'studio', String(port), '--registry', path.join(home, 'projects.json')], {cwd: project, env: {...process.env, HOME: home}});
  try {
    await new Promise(resolve => server.stdout.on('data', resolve));
    const open = async page => {
      await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: 'networkidle'});
      await page.getByText('Open studio').first().click();
      await page.waitForTimeout(4000);
    };
    // Stills at 2x, each cropped to its one point: the Play page, and the languages table.
    const still = await browser.newPage({viewport: {width: 1440, height: 1100}, deviceScaleFactor: 2});
    await open(still);
    await still.getByRole('button', {name: /Store preview/}).click();
    await still.waitForTimeout(3000);
    const install = (await still.getByText('Install', {exact: true}).first().boundingBox());
    // From the app's name down to its cards: what a shopper sees first.
    const strip = await still.locator('.store-carousel').boundingBox();
    const top = install.y - 106;
    await still.screenshot({path: path.join(out, 'editor-store.jpg'), type: 'jpeg', quality: 85,
      clip: {x: strip.x, y: top, width: strip.width, height: strip.y + strip.height - top}});
    await still.keyboard.press('Escape');
    await still.getByText('Languages').first().click();
    await still.waitForTimeout(3000);
    const rows = still.locator('.language-row');
    const first = await rows.first().boundingBox(), last = await rows.last().boundingBox();
    await still.screenshot({path: path.join(out, 'editor-languages.jpg'), type: 'jpeg', quality: 85,
      clip: {x: first.x - 24, y: first.y - 14, width: first.width + 48, height: last.y + last.height - first.y + 38}});
    await still.close();
    console.log('docs/images/editor-store.jpg\ndocs/images/editor-languages.jpg');

    // The GIF: the theme swapped on disk the way an agent edits it, each swap re-rendering the cards in place.
    const swap = theme => {
      fs.rmSync(path.join(listing, 'assets'), {recursive: true, force: true});
      for (const file of ['theme.css', 'theme.js']) {
        const from = path.join(root, 'themes', theme, file);
        if (fs.existsSync(from)) fs.writeFileSync(path.join(listing, file), fs.readFileSync(from, 'utf8').replaceAll('{{name}}', 'ChangeDetection'));
      }
      if (fs.existsSync(path.join(root, 'themes', theme, 'assets'))) fs.cpSync(path.join(root, 'themes', theme, 'assets'), path.join(listing, 'assets'), {recursive: true});
    };
    const context = await browser.newContext({viewport: {width: 1280, height: 1240}, recordVideo: {dir: home, size: {width: 1280, height: 1240}}});
    const page = await context.newPage();
    const t0 = Date.now();
    await open(page);
    await page.getByRole('button', {name: 'Toggle Sidebar'}).first().click();
    // Cards 640px tall: three fill the row.
    await page.locator('[role=slider]').first().focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await page.mouse.move(1270, 1230);
    await page.waitForTimeout(3000);
    const start = (Date.now() - t0) / 1000;
    for (const theme of ['porcelain', 'paper', 'mono', 'aurora']) { await page.waitForTimeout(2600); swap(theme); }
    await page.waitForTimeout(2600);
    const end = (Date.now() - t0) / 1000;
    await context.close();
    const video = fs.readdirSync(home).find(file => file.endsWith('.webm'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', path.join(home, video), '-vf',
      // The card row with one 10px gutter on every edge, at its own size so it stays sharp.
      'crop=1100:660:96:500,fps=8,split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
      path.join(out, 'demo.gif')]);
    console.log('docs/images/demo.gif');
  } finally {
    server.kill();
    fs.rmSync(home, {recursive: true, force: true});
  }
}

// Names (hero, before-after…) make only those images; none makes them all.
const wanted = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const images = {'hero': hero, 'before-after': beforeAfter, 'themes': themes, 'depth': depth, 'callouts': callouts, 'readme-art': readmeArt};
const browser = await chromium.launch();
try {
  for (const [name, make] of Object.entries(images)) if (!wanted.length || wanted.includes(name)) await shoot(browser, ...make(), `${name}.jpg`);
  if (process.argv.includes('--editor')) await editor(browser);
} finally { await browser.close(); }
