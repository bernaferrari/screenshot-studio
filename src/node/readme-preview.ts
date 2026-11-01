/**
 * Render the repository README the way GitHub shows it and save a full-page screenshot.
 *   npx screenshot-studio readme [--repo .] [--out /tmp/readme.png] [--width 1012]
 * Uses GitHub's Markdown API through the gh CLI (so HTML and tables render exactly as on github.com) and
 * GitHub's light stylesheet. Relative image paths load from the working tree, so unpushed images show too.
 * The repository defaults to the git root around the store listing. Exits 1 when a local image is missing.
 * previewReadme() does the same from code.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {findListing} from './project';
import {loadPlaywright} from './playwright';

export interface ReadmePreviewOptions {
  /** The repository whose README.md to render (default: the git root around the store listing). */
  repo?: string;
  /** The screenshot (default: readme-preview.png in the system temp folder). */
  out?: string;
  /** The Markdown column, in CSS pixels, as on github.com (default 1012). */
  width?: number;
}

export interface ReadmePreviewResult {
  /** The full-page screenshot (absolute path). */
  file: string;
  /** Relative image paths in the README that did not load. */
  missingImages: string[];
}

/** The git root containing the store listing, else the folder two up from this studio copy. */
function defaultRepo(): string {
  const listing = findListing();
  if (listing) {
    try {
      return execFileSync('git', ['-C', listing, 'rev-parse', '--show-toplevel'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    } catch { /* not in a git repository */ }
  }
  return path.resolve(__dirname, '..', '..');
}

/** README.md as GitHub renders it (HTML), through `gh api /markdown`. */
function renderMarkdown(text: string): string {
  try {
    return execFileSync('gh', ['api', '-X', 'POST', '/markdown', '--input', '-'],
      {input: JSON.stringify({text, mode: 'gfm'}), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024});
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {stderr?: string};
    if (failure.code === 'ENOENT') throw new Error('The readme preview needs the GitHub CLI: install gh (https://cli.github.com) and run `gh auth login`.');
    throw new Error(`GitHub couldn't render the README: ${String(failure.stderr || failure.message).trim()}. Is gh signed in (gh auth status)?`);
  }
}

export async function previewReadme(options: ReadmePreviewOptions = {}): Promise<ReadmePreviewResult> {
  const repo = path.resolve(options.repo || defaultRepo());
  const out = path.resolve(options.out || path.join(os.tmpdir(), 'readme-preview.png'));
  const width = options.width ?? 1012;
  if (!Number.isFinite(width) || width <= 0) throw new Error(`The width must be a positive number of pixels, not ${width}.`);
  const readme = path.join(repo, 'README.md');
  if (!fs.existsSync(readme)) throw new Error(`No README.md in ${repo}. Pass --repo with the repository folder.`);

  const body = renderMarkdown(fs.readFileSync(readme, 'utf8'));
  const html = `<!doctype html><meta charset="utf-8"><base href="${pathToFileURL(repo).href}/">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css">
<style>body{margin:0;background:#fff}.markdown-body{box-sizing:border-box;max-width:${width}px;margin:0 auto;padding:32px}</style>
<article class="markdown-body">${body}</article>`;
  const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'readme-preview-')), 'readme.html');
  fs.writeFileSync(page, html);

  const {chromium} = loadPlaywright();
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({viewport: {width: width + 64, height: 900}, deviceScaleFactor: 1});
    await tab.goto(pathToFileURL(page).href);
    await tab.waitForLoadState('networkidle');
    const missingImages = await tab.evaluate(() => [...document.images]
      .filter(image => !image.naturalWidth && !/^https?:/.test(image.getAttribute('src') || ''))
      .map(image => image.getAttribute('src') || ''));
    fs.mkdirSync(path.dirname(out), {recursive: true});
    await tab.screenshot({path: out, fullPage: true});
    return {file: out, missingImages};
  } finally {
    await browser.close();
  }
}

const USAGE = 'Usage: npx screenshot-studio readme [--repo <folder>] [--out <file.png>] [--width 1012]';

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
  const options: ReadmePreviewOptions = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined || value.startsWith('--')) { console.error(USAGE); return 1; }
    if (flag === '--repo') options.repo = value;
    else if (flag === '--out') options.out = value;
    else if (flag === '--width') options.width = Number(value);
    else { console.error(USAGE); return 1; }
  }
  try {
    const {file, missingImages} = await previewReadme(options);
    console.log(file);
    if (missingImages.length) { console.error(`Missing images:\n${missingImages.join('\n')}`); return 1; }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
