/**
 * screenshot-studio: one command for everything. Run it in an app (or anywhere below one); every command finds the
 * app's store-listing/ from there, or from `--listing <path>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {chooseListing} from '../node/project';

import {HELP, helpText, usage} from './commands';

type Command = {run: (argv: string[]) => Promise<number>};

const COMMANDS: Record<string, Command> = {
  init: {run: async argv => (await import('../node/init')).run(argv)},
  demo: {run: async argv => (await import('../node/demo')).run(argv)},
  themes: {run: async () => { const {themes} = await import('../node/init'); for (const t of themes()) console.log(`${t.name.padEnd(14)} ${t.description}`); return 0; }},
  studio: {run: async argv => (await import('../node/server')).run(argv)},
  check: {run: async argv => (await import('../node/check')).run(argv)},
  export: {run: async argv => (await import('../node/export')).run(argv)},
  recapture: {run: async argv => (await import('../node/recapture')).run(argv)},
  tour: {run: async argv => {
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
        if (!match) throw new Error(`Unexpected argument "${argv[i]}".\n${usage('tour')}`);
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
        console.log(`${written.length === 1 ? '1 capture' : `${written.length} captures`} written`);
        return 0;
      } catch (error) { console.error((error as Error).message); return 1; }
    }},
  screen: {run: async argv => (await import('../node/emulator')).run(argv)},
  reset: {run: async argv => {
      const {parseCli} = await import('../node/cli-args');
      const {values} = parseCli(argv, {
        serial: {type: 'string'},
        simulator: {type: 'string'},
      }, {usage: usage('reset')});
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
  locales: {run: async argv => (await import('../node/locales')).run(argv)},
  icons: {run: async argv => (await import('../node/icon')).run(argv)},
  fixtures: {run: async argv => (await import('../node/fixture-apps')).run(argv)},
  mcp: {run: async argv => (await import('../node/mcp')).run(argv)},
  readme: {run: async argv => (await import('../node/readme-preview')).run(argv)},
};
const ALIASES: Record<string, string> = {serve: 'studio', editor: 'studio', icon: 'icons', 'fixture-apps': 'fixtures', 'readme-preview': 'readme'};

const version = () => { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim(); } catch { return '?'; } };

function help(): void {
  console.log(`Screenshot Studio ${version()}: real app screens in, store and README art out.\n\nUsage: npx screenshot-studio <command> [options]\n`);
  for (const name of Object.keys(COMMANDS)) console.log(`  ${name.padEnd(11)} ${HELP[name].summary}`);
  console.log('\nCommands work on the app you run them in; those that read an app take `--listing path/to/app` too.');
  console.log('Run `npx screenshot-studio <command> --help` for its options. Docs: https://github.com/bernaferrari/screenshot-studio');
}

/** Take --listing <path> (or --listing=<path>) out of the arguments, wherever it sits: [the path, the rest]. */
function takeListing(argv: string[]): [string | undefined, string[]] {
  const at = argv.findIndex(arg => arg === '--listing' || arg.startsWith('--listing='));
  if (at < 0) return [undefined, argv];
  const inline = argv[at].startsWith('--listing=');
  const target = inline ? argv[at].slice('--listing='.length) : argv[at + 1];
  if (!target || target.startsWith('--')) throw new Error('--listing needs a path: the app, or its store-listing folder.');
  return [target, argv.filter((_, i) => i !== at && (inline || i !== at + 1))];
}

export async function main(argv: string[]): Promise<number> {
  let target: string | undefined;
  try { [target, argv] = takeListing(argv); } catch (error) { console.error((error as Error).message); return 1; }
  const [first, ...rest] = argv;
  if (!first || first === 'help' || first === '--help' || first === '-h') { help(); return 0; }
  if (first === '--version' || first === '-v' || first === 'version') { console.log(version()); return 0; }
  const name = ALIASES[first] || first;
  const command = COMMANDS[name];
  if (!command) { console.error(`Unknown command "${first}".\n`); help(); return 1; }
  if (rest.includes('--help') || rest.includes('-h')) { console.log(helpText(name)); return 0; }
  try {
    // --listing makes that app the one every listing lookup finds; other paths on the command line still mean what
    // they say from where it runs.
    if (target) {
      if (!HELP[name].listing) throw new Error(`${name} doesn't work on an existing app, so it takes no --listing.\n${usage(name)}`);
      chooseListing(target);
    }
    return await command.run(rest);
  }
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
export {changedFiles, relevantChange} from '../node/workspace/events';
export {cardsFor, withCopy, copyKeys, devicesFor, outputFile, nodesFile, followCallout, withoutMeta, requiredCopyFields} from '../core/gallery';
export {validate} from '../core/validate';
export {matcher, TapMap} from '../node/capture/screen';
export {parseCli, parseIntOption, parseListOption} from '../node/cli-args';
export {parseLucideSource} from '../node/fixture-apps';
export {previewShapes} from '../node/icon/targets';

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, (error: Error) => { console.error(error.message); process.exitCode = 1; });
export {parseHeadline, parseHighlight, frameSize, boundsFor, boundsProblem, calloutPlacement, isWidow, hasDeviceRatio, cardWords, fillWords} from '../core/layout';
