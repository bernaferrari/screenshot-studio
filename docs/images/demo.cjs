// Records the README demo: the editor open on a project while its theme changes on disk (the way an agent edits
// theme.css), each change re-rendering the cards live. Writes docs/images/demo.mp4 and demo.gif.
//   node docs/images/demo.cjs /path/to/app     (an app made with `init --screenshots`, with real headlines)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {chromium} = require('playwright');

const app = path.resolve(process.argv[2] || '');
const listing = path.join(app, 'store-listing');
if (!fs.existsSync(path.join(listing, 'studio.json'))) throw new Error('Usage: node docs/images/demo.cjs /path/to/app');
const root = path.resolve(__dirname, '../..');
const THEMES = ['aurora', 'porcelain', 'signal', 'mono'];
const name = JSON.parse(fs.readFileSync(path.join(listing, 'studio.json'), 'utf8')).app;

function useTheme(theme) {
  const from = path.join(root, 'themes', theme);
  if (fs.existsSync(path.join(from, 'assets'))) fs.cpSync(path.join(from, 'assets'), path.join(listing, 'assets'), {recursive: true});
  for (const file of ['theme.js', 'theme.css'])
    fs.writeFileSync(path.join(listing, file), fs.readFileSync(path.join(from, file), 'utf8').replaceAll('{{name}}', name));
}

(async () => {
  useTheme(THEMES[0]);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-demo-'));
  const server = spawn(process.execPath, [path.join(root, 'studio/studio.cjs'), 'studio', '8796', '--registry', path.join(work, 'projects.json'), '--add', app], {stdio: 'ignore'});
  const browser = await chromium.launch();
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const context = await browser.newContext({viewport: {width: 1440, height: 1260}, deviceScaleFactor: 1, recordVideo: {dir: work, size: {width: 1440, height: 1260}}});
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8796/studio/');
    await page.getByRole('link', {name: new RegExp(name)}).first().click();
    await page.waitForTimeout(9000);
    for (const theme of THEMES.slice(1)) {
      useTheme(theme);
      await page.waitForTimeout(9000);
    }
    useTheme(THEMES[0]);
    await page.waitForTimeout(8000);
    const video = await page.video().path();
    await context.close();
    const mp4 = path.join(__dirname, 'demo.mp4'), gif = path.join(__dirname, 'demo.gif');
    // Trim the first seconds (the editor loading), then a small MP4 and a GIF with its own palette.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '6', '-i', video, '-vf', 'scale=1200:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '6', '-i', video, '-vf',
      'fps=8,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
    console.log(`${mp4}\n${gif}`);
  } finally {
    await browser.close();
    server.kill();
  }
})();
