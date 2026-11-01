/**
 * screenshot-studio: one command for everything. Run it in an app (or anywhere below one); every command finds the
 * app's store-listing/ from there, or from `--listing <path>`.
 */
import fs from 'node:fs';
import path from 'node:path';

type Command = {summary: string; usage: string; run: (argv: string[]) => Promise<number>};

const COMMANDS: Record<string, Command> = {
  init: {summary: 'Set up Screenshot Studio in an app (or from a folder of screenshots)',
    usage: 'init [app] [--name "My App"] [--package com.example.app] [--theme starter] [--screenshots ./folder] [--locales en-US,de-DE] [--platform ios]',
    run: async argv => (await import('../node/init')).run(argv)},
  themes: {summary: 'List the themes init can start from', usage: 'themes',
    run: async () => { const {themes} = await import('../node/init'); for (const t of themes()) console.log(`${t.name.padEnd(14)} ${t.description}`); return 0; }},
  studio: {summary: 'Open the editor', usage: 'studio [port] [--open] [--add /path/to/app]…',
    run: async argv => (await import('../node/server')).run(argv)},
  check: {summary: 'Check every file without rendering (fast; run it after each edit)', usage: 'check [--json]',
    run: async argv => (await import('../node/check')).run(argv)},
  export: {summary: 'Render and check every card', usage: 'export [--locale de-DE] [--kind phone] [--card 0] [--strict] [--fastlane] [--prune] [--jobs 4] [--json]',
    run: async argv => (await import('../node/export')).run(argv)},
  recapture: {summary: 'Build the app, capture on the emulator or simulator and export', usage: 'recapture [locale…] [--boot] [--profile phone] [--serial emulator-5578] [--simulator "iPhone 17 Pro Max"] [--no-build] [--no-capture] [--no-export] [--dry-run]',
    run: async argv => (await import('../node/recapture')).run(argv)},
  tour: {summary: 'Run one capture tour by hand (the studio puts its capture module in reach)', usage: 'tour [store-listing/capture-emulator.py] [--locale en-US] [--profile phone] [--only 01-home]',
    run: async argv => {
      const {spawnSync} = await import('node:child_process');
      const {requireListing} = await import('../node/project');
      const {tourEnvironment} = await import('../node/recapture');
      const listing = requireListing();
      const script = argv[0] && !argv[0].startsWith('--') ? argv.shift()! : ['capture-emulator.py', 'capture-simulator.py'].map(f => path.join(listing, f)).find(f => fs.existsSync(f));
      if (!script) { console.error('No capture tour in store-listing/. Name one: npx screenshot-studio tour path/to/tour.py'); return 1; }
      const python = spawnSync('sh', ['-c', 'command -v uv'], {stdio: 'ignore'}).status === 0 ? ['uv', 'run', '-q', '--with', 'pillow', 'python3'] : ['python3'];
      return spawnSync(python[0], [...python.slice(1), script, ...argv], {stdio: 'inherit', env: {...process.env, ...tourEnvironment(listing)}}).status ?? 1;
    }},
  reset: {summary: 'Undo a capture that was interrupted (display size, density, demo mode on the emulator)', usage: 'reset [--serial emulator-5578]',
    run: async argv => {
      const {spawnSync} = await import('node:child_process');
      const {STUDIO_DIR} = await import('../node/project');
      return spawnSync('python3', [path.join(STUDIO_DIR, 'capture.py'), 'reset', ...argv], {stdio: 'inherit'}).status ?? 1;
    }},
  locales: {summary: 'Language coverage, or add a language', usage: 'locales [--init de-DE]',
    run: async argv => (await import('../node/locales')).run(argv)},
  icons: {summary: 'Every app icon from one drawing', usage: 'icons [brand/icon.json] | icons --import drawable.xml',
    run: async argv => (await import('../node/icon')).run(argv)},
  fixtures: {summary: 'Build fictional apps to install on the capture emulator', usage: 'fixtures fixture-apps.json [--install emulator-5578] [--uninstall emulator-5578]',
    run: async argv => (await import('../node/fixture-apps')).run(argv)},
  mcp: {summary: 'Run as an MCP server, so agents can check, render and look at cards', usage: 'mcp [--listing path/to/app]',
    run: async argv => (await import('../node/mcp')).run(argv)},
  readme: {summary: 'Preview the README as GitHub shows it', usage: 'readme [--out file.png] [--width 1012]',
    run: async argv => (await import('../node/readme-preview')).run(argv)},
};
const ALIASES: Record<string, string> = {serve: 'studio', editor: 'studio', icon: 'icons', 'fixture-apps': 'fixtures', 'readme-preview': 'readme'};

const version = () => { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch { return '?'; } };

function help(): void {
  console.log(`Screenshot Studio ${version()}: real app screens in, store and README art out.\n\nUsage: npx screenshot-studio <command> [options]\n`);
  for (const [name, command] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(11)} ${command.summary}`);
  console.log('\nEvery command works on the app you run it in, or on `--listing path/to/app`.');
  console.log('Run `npx screenshot-studio <command> --help` for its options. Docs: https://github.com/bernaferrari/screenshot-studio');
}

export async function main(argv: string[]): Promise<number> {
  // --listing <path> works for every command: it's where the command runs.
  const at = argv.indexOf('--listing');
  if (at >= 0) {
    const target = path.resolve(argv[at + 1] || '');
    if (!fs.existsSync(target)) { console.error(`No folder ${target}`); return 1; }
    process.chdir(path.basename(target) === 'store-listing' ? path.dirname(target) : target);
    argv = argv.filter((_, i) => i !== at && i !== at + 1);
  }
  const [first, ...rest] = argv;
  if (!first || first === 'help' || first === '--help' || first === '-h') { help(); return 0; }
  if (first === '--version' || first === '-v' || first === 'version') { console.log(version()); return 0; }
  const name = ALIASES[first] || first;
  const command = COMMANDS[name];
  if (!command) { console.error(`Unknown command "${first}".\n`); help(); return 1; }
  if (rest.includes('--help') || rest.includes('-h')) { console.log(`${command.summary}\n\n  npx screenshot-studio ${command.usage}`); return 0; }
  try { return await command.run(rest); }
  catch (error) { console.error((error as Error).message); return 1; }
}

// The library, for tools and tests: `require('screenshot-studio')`.
export {exportListing, formatSummary} from '../node/export';
export {recapture, bootEmulator} from '../node/recapture';
export {checkListing, formatIssues, imageSize} from '../node/check';
export {loadListing, findListing, requireListing, readJson, writeJson} from '../node/project';
export {serve} from '../node/server';
export {createWorkspaceStore} from '../node/workspace/store';
export {cardsFor, withCopy, copyKeys, devicesFor, outputFile, nodesFile, followCallout, withoutMeta} from '../core/gallery';
export {validate} from '../core/validate';

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, (error: Error) => { console.error(error.message); process.exitCode = 1; });
export {parseHeadline, parseHighlight, frameSize, boundsFor, boundsProblem, calloutPlacement, isWidow, hasDeviceRatio} from '../core/layout';
