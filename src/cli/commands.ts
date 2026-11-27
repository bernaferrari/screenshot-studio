/**
 * What every command says about itself: its summary, its usage line and each option, in one place. `--help` prints
 * it, and a command's parse error quotes its usage, so the two never disagree. Data only: no command runs from here.
 */

export interface CommandHelp {
  summary: string;
  /** Arguments and options after the command's name. */
  usage: string;
  /** Each option (or argument) and what it does, in the order the usage gives them. */
  options?: [string, string][];
  /** Works on an existing app's store-listing/, so it takes the global --listing. */
  listing?: boolean;
}

const LISTING: [string, string] = ['--listing <path>', 'The app (or its store-listing/) to work on, instead of the one here'];
const DEVICE: [string, string][] = [
  ['--serial <emulator>', 'The capture emulator (default emulator-5578, or CAPTURE_SERIAL); never a phone'],
  ['--simulator <name>', 'An iOS simulator by name or UDID (or CAPTURE_SIMULATOR)'],
];

export const HELP: Record<string, CommandHelp> = {
  init: {
    summary: 'Set up Screenshot Studio in an app (or from a folder of screenshots)',
    usage: '[app] [--name "My App"] [--screenshots ./folder] [--package com.example.app] [--platform ios] [--theme starter] [--locales en-US,de-DE]',
    options: [
      ['[app]', 'The app folder (default: here). Run it again in a set-up app to refresh the agent skill; your files are kept'],
      ['--name <name>', 'The app\'s name (default: from fastlane metadata, or the folder)'],
      ['--screenshots <folder>', 'Start from these screenshots (one folder, or one per language); fastlane folders are found on their own'],
      ['--package <id>', 'Capture this Android app with a tour instead'],
      ['--platform <android|ios>', 'ios: App Store sizes and a simulator tour'],
      ['--theme <name>', 'The look to start from (see `themes`; default starter)'],
      ['--locales <list>', 'Languages to set up, comma-separated (the first is the reference)'],
    ],
  },
  demo: {
    summary: 'See it work in a minute: a finished example, exported and opened in the editor',
    usage: '[folder] [--theme aurora] [--3d] [--no-open]',
    options: [
      ['[folder]', 'Where to make it (default screenshot-studio-demo); run again to switch theme, keeping your edits'],
      ['--theme <name>', 'Another look for the same cards'],
      ['--3d', 'Tilt the phones, drawn as real 3D devices'],
      ['--no-open', 'Export only; don\'t open the editor'],
    ],
  },
  themes: {summary: 'List the themes init can start from', usage: ''},
  studio: {
    summary: 'Open the editor',
    usage: '[port] [--open] [--add /path/to/app]…',
    options: [
      ['[port]', 'The port to serve on (default 8790)'],
      ['--open', 'Open it in the browser'],
      ['--add <path>', 'Add an app to the editor\'s project list (repeatable)'],
      LISTING,
    ],
    listing: true,
  },
  check: {
    summary: 'Check every file without rendering (fast; run it after each edit)',
    usage: '[--json]',
    options: [['--json', 'Every issue as JSON, with what to do about it'], LISTING],
    listing: true,
  },
  export: {
    summary: 'Render and check every card',
    usage: '[--locale de-DE] [--gallery phone] [--card home] [--strict] [--fastlane] [--prune] [--jobs 4] [--json]',
    options: [
      ['--locale <locale>', 'Only this language'],
      ['--gallery <name>', 'Only this gallery (phone, tablet7…), or strips for the README strips'],
      ['--card <feature|index>', 'Only this card: its feature name (with --gallery), or its index from 0; quick while editing'],
      ['--strict', 'Fail on any warning, and on languages still borrowing the reference\'s words, captures or callout places'],
      ['--fastlane', 'Also write fastlane\'s folders (Play, App Store) and F-Droid metadata'],
      ['--prune', 'Delete images no card writes any more, instead of warning about them'],
      ['--jobs <n>', 'Cards rendered at once (default: up to 4)'],
      ['--json', 'The result as JSON: every file written, its notes and the warnings'],
      LISTING,
    ],
    listing: true,
  },
  recapture: {
    summary: 'Build the app, capture on the emulator or simulator and export',
    usage: '[locale…] [--profile phone] [--boot] [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"] [--no-build] [--no-capture] [--no-export] [--dry-run]',
    options: [
      ['[locale…]', 'Only these languages (default: every captured language)'],
      ['--profile <name>', 'Only this capture size (phone, tablet7…)'],
      ['--boot', 'Start the capture emulator when it isn\'t running'],
      ...DEVICE,
      ['--no-build', 'Use the last build'],
      ['--no-capture', 'Skip the tour: export what is captured'],
      ['--no-export', 'Capture only'],
      ['--dry-run', 'Print the steps without running them'],
      LISTING,
    ],
    listing: true,
  },
  tour: {
    summary: 'Run the capture tour by hand: one language, on the capture emulator or simulators',
    usage: '[--locale en-US] [--profile phone,tablet7] [--only 01-home,02-log] [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"] [--<option> value…]',
    options: [
      ['--locale <locale>', 'The language to capture (default: the reference language)'],
      ['--profile <list>', 'Only these capture sizes'],
      ['--only <list>', 'Save only these scenes (the others are still reached)'],
      ...DEVICE,
      ['--<option> <value>', 'Anything else reaches the tour as d.options (--palette blue → d.options.palette)'],
      LISTING,
    ],
    listing: true,
  },
  screen: {
    summary: 'What the capture emulator (or a simulator) shows: a screenshot and every element to tap, for writing a tour',
    usage: '[--tap "Settings" | --tap 540,1200 | --back] [--out screen.png] [--json] [--serial emulator-5578 | --simulator "iPhone 17 Pro Max"]',
    options: [
      ['--tap <label|x,y>', 'Tap first: an element by its label, or a point'],
      ['--back', 'Press back first'],
      ['--out <file>', 'Where to save the screenshot (default screen.png)'],
      ['--json', 'The elements as JSON'],
      ['--app <id>', 'On a simulator: the app whose elements to list'],
      ...DEVICE,
    ],
  },
  reset: {
    summary: 'Undo a capture that was interrupted (display size, density, demo mode; a simulator\'s status bar and appearance)',
    usage: '[--serial emulator-5578 | --simulator "iPhone 17 Pro Max"]',
    options: DEVICE,
  },
  locales: {
    summary: 'Language coverage, or add a language',
    usage: '[--init de-DE]',
    options: [['--init <locale>', 'Add a language: its copy.json, ready to translate'], LISTING],
    listing: true,
  },
  icons: {
    summary: 'Every app icon from one drawing',
    usage: '[store-listing/brand/icon.json] | --import drawable.xml',
    options: [
      ['[file]', 'The drawing to make icons from (default store-listing/brand/icon.json)'],
      ['--import <file>', 'Start a drawing from an Android vector drawable'],
    ],
  },
  fixtures: {
    summary: 'Build fictional apps to install on the capture emulator',
    usage: 'fixture-apps.json [--install emulator-5578] [--uninstall emulator-5578]',
    options: [
      ['--install <emulator>', 'Install them on this emulator'],
      ['--uninstall <emulator>', 'Remove them from this emulator'],
    ],
  },
  mcp: {
    summary: 'Run as an MCP server, so agents can check, render and look at cards',
    usage: '[--listing path/to/app]',
    options: [LISTING],
    listing: true,
  },
  readme: {
    summary: 'Preview the README as GitHub shows it',
    usage: '[--repo .] [--out file.png] [--width 1012]',
    options: [
      ['--repo <folder>', 'The repository whose README to show (default: here)'],
      ['--out <file>', 'Where to save the picture'],
      ['--width <px>', 'The page width (default 1012, GitHub\'s)'],
    ],
  },
};

/** `Usage: npx screenshot-studio <command> …`, for a command's parse errors. */
export const usage = (command: string) => `Usage: npx screenshot-studio ${command}${HELP[command]?.usage ? ` ${HELP[command].usage}` : ''}`;

/** A command's --help: its summary, usage and options. */
export function helpText(command: string): string {
  const help = HELP[command];
  const options = help.options || [];
  const width = Math.max(0, ...options.map(([flag]) => flag.length));
  return [help.summary, '', `  ${usage(command).replace(/^Usage: /, '')}`,
    ...(options.length ? ['', ...options.map(([flag, text]) => `  ${flag.padEnd(width)}  ${text}`)] : [])].join('\n');
}
