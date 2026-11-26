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
  demo: {summary: 'See it work in a minute: a finished example, exported and opened in the editor', usage: 'demo [folder] [--theme aurora] [--3d] [--no-open]',
    run: async argv => (await import('../node/demo')).run(argv)},
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
  tour: {summary: 'Run the capture tour by hand: one language, on the capture emulator or simulators', usage: 'tour [--locale en-US] [--profile phone,tablet7] [--only 01-home,02-log] [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"] [--<option> value…]',
    run: async argv => {
      const {requireListing, loadListing} = await import('../node/project');
      const {parseListOption} = await import('../node/cli-args');
      const listing = requireListing();
      const {tourFile} = await import('../node/recapture');
      // Parse known options plus arbitrary --name value / --name=value / --flag passthrough options for d.options.
      const known: Record<string, string | undefined> = {};
      const options: Record<string, unknown> = {};
      const reserved = new Set(['locale', 'profile', 'only', 'serial', 'simulator']);
      for (let i = 0; i < argv.length; i++) {
        const match = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
        if (!match) throw new Error(`Unexpected argument "${argv[i]}".\nUsage: npx screenshot-studio ${COMMANDS.tour.usage}`);
        const [, name, inline] = match;
        const value = inline !== undefined ? inline
          : (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true);
        if (reserved.has(name)) {
          if (typeof value !== 'string' || !value) throw new Error(`--${name} requires a value.`);
          known[name] = value;
        } else {
          options[name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value;
        }
      }
      try {
        const file = tourFile(listing);
        const {runTour} = await import('../node/capture/tour');
        const {DEFAULT_SERIAL} = await import('../node/recapture');
        const written = await runTour(file, {listing, locale: known.locale || loadListing(listing).defaultLocale,
          profiles: parseListOption(known.profile), only: parseListOption(known.only),
          serial: known.serial || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL, simulator: known.simulator || process.env.CAPTURE_SIMULATOR, options});
        console.log(`${written.length} capture(s) written`);
        return 0;
      } catch (error) { console.error((error as Error).message); return 1; }
    }},
  screen: {summary: 'What the capture emulator (or a simulator) shows: a screenshot and every element to tap, for writing a tour', usage: 'screen [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"] [--out screen.png] [--json] [--tap "Settings" | --tap 540,1200 | --back]',
    run: async argv => (await import('../node/emulator')).run(argv)},
  reset: {summary: 'Undo a capture that was interrupted (display size, density, demo mode; a simulator\'s status bar and appearance)', usage: 'reset [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"]',
    run: async argv => {
      const {parseCli} = await import('../node/cli-args');
      const {values} = parseCli(argv, {
        serial: {type: 'string'},
        simulator: {type: 'string'},
      }, {usage: 'Usage: npx screenshot-studio reset [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"]'});
      try {
        if (values.simulator) {
          const {findSimulator} = await import('../node/ios');
          const {Simulator} = await import('../node/capture/simulator');
          const found = findSimulator(values.simulator);
          new Simulator(found.udid, found.name).reset();
          console.log(`${found.name} reset`);
          return 0;
        }
        const {Emulator} = await import('../node/capture/emulator');
        const {DEFAULT_SERIAL} = await import('../node/recapture');
        const serial = values.serial || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL;
        new Emulator(serial).reset();
        console.log(`${serial} reset`);
        return 0;
      } catch (error) { console.error((error as Error).message); return 1; }
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
  // --listing <path> or --listing=<path> works for every command: it's where the command runs.
  const at = argv.findIndex(arg => arg === '--listing' || arg.startsWith('--listing='));
  if (at >= 0) {
    const inline = argv[at].startsWith('--listing=');
    const rawTarget = inline ? argv[at].slice('--listing='.length) : argv[at + 1];
    if (!rawTarget) { console.error('--listing requires a path.'); return 1; }
    const target = path.resolve(rawTarget);
    if (!fs.existsSync(target)) { console.error(`No folder ${target}`); return 1; }
    process.chdir(path.basename(target) === 'store-listing' ? path.dirname(target) : target);
    argv = argv.filter((_, i) => i !== at && (inline || i !== at + 1));
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
export {recapture, bootEmulator, tourFile} from '../node/recapture';
export {runTour} from '../node/capture/tour';
export {appleLanguage} from '../node/capture/simulator';
export {checkListing, formatIssues, imageSize} from '../node/check';
export {compileTheme, candidates as themeClasses} from '../node/tailwind';
export {loadListing, findListing, requireListing, readJson, writeJson} from '../node/project';
export {serve} from '../node/server';
export {createWorkspaceStore} from '../node/workspace/store';
export {cardsFor, withCopy, copyKeys, devicesFor, outputFile, nodesFile, followCallout, withoutMeta, requiredCopyFields} from '../core/gallery';
export {validate} from '../core/validate';
export {matcher, TapMap} from '../node/capture/screen';
export {parseCli, parseIntOption, parseListOption} from '../node/cli-args';
export {parseLucideSource} from '../node/fixture-apps';
export {previewShapes} from '../node/icon/targets';

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, (error: Error) => { console.error(error.message); process.exitCode = 1; });
export {parseHeadline, parseHighlight, frameSize, boundsFor, boundsProblem, calloutPlacement, isWidow, hasDeviceRatio, cardWords, fillWords} from '../core/layout';
