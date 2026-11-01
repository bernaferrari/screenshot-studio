/**
 * screenshot-studio: one command for everything. From the package (`npx screenshot-studio …`) it sets apps up and
 * runs every other command through the app's own copy of the studio (store-listing/studio/), so an app's images
 * always come from the studio version it was made with. Inside an app, `node store-listing/studio/studio.cjs …`
 * runs the same commands directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {findListing} from '../node/project';

type Command = {summary: string; usage: string; package?: boolean; run: (argv: string[]) => Promise<number>};

const COMMANDS: Record<string, Command> = {
  init: {summary: 'Set up Screenshot Studio in an app (or from a folder of screenshots)', package: true,
    usage: 'init [app] [--name "My App"] [--package com.example.app] [--theme starter] [--screenshots ./folder] [--locales en-US,de-DE]',
    run: async argv => (await import('../node/init')).run(argv)},
  sync: {summary: "Update the app's copy of the studio to this version", package: true, usage: 'sync [app] [--check]',
    run: async argv => (await import('../node/init')).runSync(argv)},
  themes: {summary: 'List the themes init can start from', package: true, usage: 'themes',
    run: async () => { const {themes} = await import('../node/init'); for (const t of themes()) console.log(`${t.name.padEnd(14)} ${t.description}`); return 0; }},
  studio: {summary: 'Open the editor', usage: 'studio [port] [--open] [--add /path/to/app]…',
    run: async argv => (await import('../node/server')).run(argv)},
  check: {summary: 'Check every file without rendering (fast; run it after each edit)', usage: 'check [--json]',
    run: async argv => (await import('../node/check')).run(argv)},
  export: {summary: 'Render and check every card', usage: 'export [--locale de-DE] [--kind phone] [--card 0] [--strict] [--fastlane] [--json]',
    run: async argv => (await import('../node/export')).run(argv)},
  recapture: {summary: 'Build the app, capture on the emulator and export', usage: 'recapture [locale…] [--boot] [--profile phone] [--no-build] [--no-capture] [--no-export] [--dry-run]',
    run: async argv => (await import('../node/recapture')).run(argv)},
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

/** This file's folder: the package's studio/, or an app's store-listing/studio/. */
const HERE = __dirname;
const VENDORED = fs.existsSync(path.join(HERE, '..', 'studio.json'));
const version = () => { try { return fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim(); } catch { return '?'; } };

function help(): void {
  console.log(`Screenshot Studio ${version()}: real app screens in, store and README art out.\n\nUsage: npx screenshot-studio <command> [options]\n`);
  for (const [name, command] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(11)} ${command.summary}`);
  console.log('\nRun `npx screenshot-studio <command> --help` for its options. Docs: https://github.com/bernaferrari/screenshot-studio');
}

/** Run a command in the app's own copy of the studio, with Playwright found. */
function delegate(listing: string, name: string, argv: string[]): number {
  const entry = path.join(listing, 'studio', 'studio.cjs');
  if (!fs.existsSync(entry)) {
    console.error(`${path.relative(process.cwd(), listing) || '.'} has an older copy of the studio. Update it with \`npx screenshot-studio sync\`.`);
    return 1;
  }
  const theirs = fs.readFileSync(path.join(listing, 'studio', 'VERSION'), 'utf8').trim();
  if (theirs !== version()) console.error(`(The app uses studio ${theirs}; this is ${version()}. \`npx screenshot-studio sync\` updates it.)`);
  const env = {...process.env};
  if (!env.PLAYWRIGHT_MODULE) { try { env.PLAYWRIGHT_MODULE = path.dirname(require.resolve('playwright/package.json')); } catch { /* the app may have its own */ } }
  return spawnSync(process.execPath, [entry, name, ...argv], {stdio: 'inherit', env}).status ?? 1;
}

export async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (!first || first === 'help' || first === '--help' || first === '-h') { help(); return 0; }
  if (first === '--version' || first === '-v' || first === 'version') { console.log(version()); return 0; }
  const name = ALIASES[first] || first;
  const command = COMMANDS[name];
  if (!command) { console.error(`Unknown command "${first}".\n`); help(); return 1; }
  if (rest.includes('--help') || rest.includes('-h')) { console.log(`${command.summary}\n\n  npx screenshot-studio ${command.usage}`); return 0; }
  if (command.package) {
    if (VENDORED) { console.error(`Run \`${name}\` from the package: npx screenshot-studio ${name}`); return 1; }
    return command.run(rest);
  }
  if (VENDORED) return command.run(rest);
  // From the package: find the app and use its copy.
  const at = rest.indexOf('--listing');
  const listing = findListing(at >= 0 ? rest[at + 1] : undefined);
  if (!listing) {
    if (name === 'studio') return command.run(rest);
    console.error('No store-listing/studio.json here or above. Set one up with `npx screenshot-studio init`.');
    return 1;
  }
  return delegate(listing, name, at >= 0 ? rest.filter((_, i) => i !== at && i !== at + 1) : rest);
}

// The library, for tools and tests: `require('store-listing/studio/studio.cjs')`.
export {exportListing, formatSummary} from '../node/export';
export {recapture, bootEmulator} from '../node/recapture';
export {checkListing, formatIssues, imageSize} from '../node/check';
export {loadListing, findListing, readJson, writeJson} from '../node/project';
export {serve} from '../node/server';
export {createWorkspaceStore} from '../node/workspace/store';
export {cardsFor, withCopy, copyKeys, devicesFor, outputFile, nodesFile, followCallout, withoutMeta} from '../core/gallery';
export {validate} from '../core/validate';

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, (error: Error) => { console.error(error.message); process.exitCode = 1; });
