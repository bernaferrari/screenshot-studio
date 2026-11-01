/** Finding Playwright, which renders every card: wherever it is, with a message that says how to get it when it isn't. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Playwright = typeof import('playwright');

/** Where Playwright may live, most specific first. */
function candidates(): string[] {
  const found: string[] = [];
  if (process.env.PLAYWRIGHT_MODULE) found.push(process.env.PLAYWRIGHT_MODULE);
  // Beside this studio (the package's own node_modules), then up from the app and the working directory.
  for (const start of [__dirname, process.cwd()]) {
    for (let dir = start; ; dir = path.dirname(dir)) {
      found.push(path.join(dir, 'node_modules', 'playwright'));
      if (path.dirname(dir) === dir) break;
    }
  }
  // npx's cache, where `npx screenshot-studio` installed it.
  const cache = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(cache)) for (const entry of fs.readdirSync(cache)) found.push(path.join(cache, entry, 'node_modules', 'playwright'));
  return found;
}

/** The directory of an installed Playwright, or null. */
export function findPlaywright(): string | null {
  for (const dir of candidates()) if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  try { return path.dirname(require.resolve('playwright/package.json')); } catch { return null; }
}

export function loadPlaywright(): Playwright {
  const dir = findPlaywright();
  if (!dir) throw new Error('Playwright renders the cards and isn\'t installed. Run the studio with `npx screenshot-studio …`, or install it: `npm install -D playwright && npx playwright install chromium`.');
  return require(dir) as Playwright;
}

/**
 * Chromium, the browser every card renders in. The first time, when Playwright has no Chromium yet, it downloads
 * the one this Playwright needs (once, about 100 MB) and carries on, instead of stopping with an install hint.
 */
export async function launchBrowser(log: (line: string) => void = line => console.error(line)): Promise<import('playwright').Browser> {
  const {chromium} = loadPlaywright();
  try { return await chromium.launch(); }
  catch (error) {
    if (!/Executable doesn't exist|browserType\.launch.*install/i.test((error as Error).message)) throw error;
    const cli = path.join(findPlaywright()!, 'cli.js');
    log('Downloading Chromium to render the cards (once, about 100 MB)…');
    const {spawnSync} = require('node:child_process') as typeof import('node:child_process');
    const done = spawnSync(process.execPath, [cli, 'install', '--only-shell', 'chromium'], {stdio: ['ignore', 'inherit', 'inherit']});
    if (done.status !== 0) throw new Error('Chromium could not be downloaded. Check the connection and try again, or run `npx playwright install chromium`.');
    return chromium.launch();
  }
}
