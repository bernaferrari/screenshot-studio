/**
 * A finished example in one command: real captures of an app in three languages, made into a Google Play set with a
 * theme, exported and opened in the editor.
 *   npx screenshot-studio demo [folder] [--theme aurora] [--no-open]
 * Run it again with another --theme to see the same cards in another look; your edits to the words are kept.
 */
import fs from 'node:fs';
import path from 'node:path';
import {exportListing, formatSummary} from './export';
import {installTheme, themes} from './init';

const DEMO = path.resolve(__dirname, '..', 'templates', 'demo');

export async function run(argv: string[]): Promise<number> {
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const theme = option('theme') || 'aurora';
  const folder = path.resolve(argv.find((word, i) => !word.startsWith('--') && argv[i - 1] !== '--theme') || 'screenshot-studio-demo');
  const listing = path.join(folder, 'store-listing');
  if (!themes().some(t => t.name === theme)) { console.error(`No theme "${theme}". Available: ${themes().map(t => t.name).join(', ')}`); return 1; }
  if (fs.existsSync(listing)) {
    if (!fs.existsSync(path.join(listing, '.demo'))) { console.error(`${path.relative(process.cwd(), listing)} isn't a demo; pick another folder: npx screenshot-studio demo my-demo`); return 1; }
    console.log(`Using the demo in ${path.relative(process.cwd(), folder) || '.'}, with the ${theme} theme.`);
  } else {
    fs.cpSync(DEMO, listing, {recursive: true});
    fs.writeFileSync(path.join(listing, '.demo'), 'Made by `npx screenshot-studio demo`; it may swap the theme here.\n');
    console.log(`Made a demo in ${path.relative(process.cwd(), folder)}: real captures in English, German and Chinese, with the ${theme} theme.`);
  }
  // The theme is swapped whole: its files and fonts replace the last one's.
  fs.rmSync(path.join(listing, 'assets'), {recursive: true, force: true});
  installTheme(listing, theme, {fill: text => text.replaceAll('{{name}}', 'ChangeDetection'), overwrite: true,
    write: (relative, content) => fs.writeFileSync(path.join(listing, relative), content)});

  const result = await exportListing({listing});
  console.log(`\n${formatSummary(result)}`);
  if (!result.ok) { console.error(`\n${result.error}`); return 1; }
  const where = path.relative(process.cwd(), listing);
  console.log(`\nThe cards are in ${where}/<language>/phone/. Try another look: npx screenshot-studio demo --theme paper`);
  if (argv.includes('--no-open')) return 0;
  console.log('Opening the editor (Ctrl-C to stop)…');
  process.chdir(folder);
  return (await import('./server')).run(['--open']);
}
