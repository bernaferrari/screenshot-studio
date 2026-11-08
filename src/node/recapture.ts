/**
 * Rebuild the capture app, capture on the emulator or simulator, and export, as studio.json's "capture" block says:
 *   npx screenshot-studio recapture [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]
 * Without locales every locale in studio.json is exported, and captured where a run asks for it.
 *
 *   "capture": {
 *     "build": "./gradlew :app:assembleStoreCapture",               shell command, run from the repository
 *     "install": [{"apk": "app/build/…/app-storeCapture.apk", "package": "com.example.storecapture"}],
 *     "runs": [{"options": {"theme": "dark"},                        the tour's d.options; ${NAME} reads an environment variable
 *               "profiles": ["phone", "tablet7"],                    default: every capture profile
 *               "locales": "default"}],                              "all" (default), "default" or a list
 *     "retries": 2,                                                  per capture run
 *     "serial": "emulator-5578",                                     the capture emulator (or CAPTURE_SERIAL)
 *     "avd": "Pixel_9_API_36",                                       what --boot starts when it isn't running
 *     "platform": "ios",                                             capture on iOS simulators instead (below)
 *     "simulator": "iPhone 17 Pro Max",                              iOS: for profiles that name none
 *     "export": "cd store-listing && node render.mjs --locale {locale}",  instead of the studio's export, per locale
 *     "after": ["node scripts/refresh-readme.mjs"]                   shell commands once everything is exported
 *   }
 *
 * Both platforms run store-listing/capture.tour.mjs in the studio itself (capture/tour.ts, on agent-device), per run
 * and locale. The default locale goes first, since it records the tap map other locales replay. --boot starts the
 * capture emulator headless when it isn't running and waits for it.
 *
 * iOS ("platform": "ios"): install entries are {"app": "build/…/App.app", "package": "<bundle ID>"}, installed on each
 * simulator the capture profiles use (profiles.json's "platform": "ios" ones with a capture size, each on its
 * "simulator"); --boot boots those simulators first and leaves them running.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Emulator} from './capture/emulator';
import {Simulator} from './capture/simulator';
import {runTour} from './capture/tour';
import {spawn, spawnSync} from 'node:child_process';
import {loadListing, requireListing, STUDIO_DIR} from './project';
import {bootSimulator, findSimulator, simulatorsFor} from './ios';
import {findPlaywright} from './playwright';

export interface RecaptureOptions {
  listing?: string;
  /** Only these languages (default: every language in studio.json). */
  locales?: string[];
  /** Only this capture profile. */
  profile?: string;
  serial?: string;
  /** iOS: the simulator for profiles that name none (default: studio.json capture.simulator). */
  simulator?: string;
  /** Start the capture emulator when it isn't running. */
  boot?: boolean;
  build?: boolean;
  capture?: boolean;
  export?: boolean;
  /** Print the commands without running them. */
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface RecaptureResult {
  ok: boolean;
  locales: string[];
  /** Languages whose export failed (their captures are in place). */
  failedExports: string[];
  error?: string;
}

/** What the build, export and after commands get from the studio: the app's listing, the CLI, Playwright. */
export function commandEnvironment(listing: string): NodeJS.ProcessEnv {
  return {
    SCREENSHOT_STUDIO_LISTING: listing,
    SCREENSHOT_STUDIO: path.join(STUDIO_DIR, 'studio.cjs'),
    ...(findPlaywright() ? {PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || findPlaywright()!} : {}),
  };
}

/** The listing's tour, store-listing/capture.tour.mjs; a Python tour from older versions is named, with what to do. */
export function tourFile(listing: string): string {
  const file = path.join(listing, 'capture.tour.mjs');
  if (fs.existsSync(file)) return file;
  const old = ['capture-emulator.py', 'capture-simulator.py'].find(name => fs.existsSync(path.join(listing, name)));
  if (old) throw new Error(`store-listing/${old} is a Python tour, which this version no longer runs. Write its scenes as store-listing/capture.tour.mjs (docs/capture.md shows the shape), then delete ${old}.`);
  throw new Error('No capture tour: write store-listing/capture.tour.mjs (docs/capture.md shows the shape).');
}

export const DEFAULT_SERIAL = 'emulator-5578';

const sdkRoot = () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  [path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')].find(dir => fs.existsSync(dir)) || '';
const adb = (serial: string, ...args: string[]) => spawnSync('adb', ['-s', serial, ...args], {encoding: 'utf8'});

/** Whether the emulator is attached and has finished booting. */
export function booted(serial: string): boolean {
  return adb(serial, 'shell', 'getprop', 'sys.boot_completed').stdout?.trim() === '1';
}

/** Why the capture emulator can't be used and the ways forward, or null when it has booted. */
export function missingEmulator(serial: string): string | null {
  if (booted(serial)) return null;
  const devices = (spawnSync('adb', ['devices'], {encoding: 'utf8'}).stdout || '').split('\n').slice(1)
    .map(line => line.split('\t')).filter(([id, state]) => id && state === 'device').map(([id]) => id);
  return [`The capture emulator ${serial} isn't running.`,
    `  Start a dedicated one: npx screenshot-studio recapture --boot   (boots an emulator as ${serial})`,
    ...devices.filter(id => id.startsWith('emulator-') && id !== serial).map(id =>
      `  Or capture on ${id}: add --serial ${id}   (its display size, language and demo mode change during the capture and are restored after)`),
    'Captures run only on emulators, never on a phone.'].join('\n');
}

/** Start an emulator headless on the serial's port and wait until Android has booted. */
export async function bootEmulator(serial: string, avd: string | undefined, log: (line: string) => void): Promise<void> {
  if (booted(serial)) return;
  const port = Number(serial.replace('emulator-', ''));
  if (!Number.isInteger(port)) throw new Error(`Can't boot ${serial}: the serial must look like emulator-5578`);
  const emulator = path.join(sdkRoot(), 'emulator', 'emulator');
  if (!fs.existsSync(emulator)) throw new Error('No Android emulator found. Set ANDROID_HOME to your Android SDK.');
  const images = spawnSync(emulator, ['-list-avds'], {encoding: 'utf8'}).stdout.split('\n').map(line => line.trim()).filter(Boolean);
  const name = avd || images[0];
  if (!name) throw new Error('No emulator image (AVD) found. Create one in Android Studio, then set "capture": {"avd": "…"} in studio.json.');
  if (!images.includes(name)) throw new Error(`No emulator image named ${name}. Available: ${images.join(', ') || 'none'}`);
  log(`Booting ${name} as ${serial} (headless)…`);
  spawn(emulator, ['-avd', name, '-port', String(port), '-no-window', '-no-audio', '-no-boot-anim'], {detached: true, stdio: 'ignore'}).unref();
  const deadline = Date.now() + 5 * 60_000;
  while (!booted(serial)) {
    if (Date.now() > deadline) throw new Error(`${serial} did not finish booting in 5 minutes`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  for (const args of [['wm', 'size', 'reset'], ['wm', 'density', 'reset'], ['cmd', 'uimode', 'night', 'no']]) adb(serial, 'shell', ...args);
  log(`${serial} is ready.`);
}

export async function recapture(options: RecaptureOptions = {}): Promise<RecaptureResult> {
  const log = options.log || ((line: string) => console.log(line));
  const listing = requireListing(options.listing);
  const {config, profiles, repo, defaultLocale, locales: configured} = loadListing(listing);
  const capture = config.capture;
  const locales = options.locales?.length ? [...options.locales] : [...configured];
  const result: RecaptureResult = {ok: false, locales, failedExports: []};
  try {
    if (!capture) throw new Error('studio.json has no "capture" block; see docs/capture.md');
    const ios = capture.platform === 'ios';
    const serial = options.serial || capture.serial || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL;
    if (!ios && !serial.startsWith('emulator-')) throw new Error('Use a capture emulator, never a physical phone.');
    const simulator = options.simulator || capture.simulator || process.env.CAPTURE_SIMULATOR;
    const unknown = locales.filter(locale => !configured.includes(locale));
    if (unknown.length) throw new Error(`Not in studio.json locales: ${unknown.join(', ')}`);
    locales.sort((a, b) => Number(b === defaultLocale) - Number(a === defaultLocale));
    const captureProfiles = Object.keys(profiles).filter(name => ios
      ? profiles[name].platform === 'ios' && profiles[name].captureWidth : profiles[name].captureDensity);
    if (options.profile && !profiles[options.profile]?.captureWidth) throw new Error(`No capture profile ${options.profile} in profiles.json`);

    // Build, export and after commands reach the studio's commands and Playwright through the environment.
    const env: NodeJS.ProcessEnv = {...process.env, ...commandEnvironment(listing), ...(ios ? {} : {CAPTURE_SERIAL: serial, ANDROID_SERIAL: serial})};
    const expand = (word: string) => String(word).replace(/\$\{(\w+)\}/g, (_, name: string) => {
      if (env[name] === undefined) throw new Error(`Set ${name} for this capture (studio.json capture options use it)`);
      return env[name]!;
    });
    const run = (command: string, {check = true} = {}) => {
      log(`\n$ ${command}`);
      if (options.dryRun) return true;
      const done = spawnSync('sh', ['-c', command], {cwd: repo, env, stdio: 'inherit'});
      if (done.status !== 0 && check) throw new Error(`Failed (${done.status ?? done.signal}): ${command}`);
      return done.status === 0;
    };

    // iOS: every simulator the selected profiles capture on.
    const sims = ios && options.capture !== false ? simulatorsFor(profiles, captureProfiles.filter(name => !options.profile || name === options.profile), simulator) : [];
    if (options.build !== false && capture.build) run(capture.build);
    if (options.capture !== false) {
      const tour = tourFile(listing);
      if (options.boot && !options.dryRun) {
        if (ios) for (const sim of sims) await bootSimulator(sim, log);
        else await bootEmulator(serial, capture.avd, log);
      }
      if (!ios && !options.dryRun) { const problem = missingEmulator(serial); if (problem) throw new Error(problem); }
      // Android installs once on the emulator; iOS apps go to each simulator as the tour opens it.
      const apps: string[] = [];
      for (const {apk, app, package: id} of capture.install || []) {
        const file = ios ? app : apk;
        if (!file) throw new Error(`capture.install needs ${ios ? '"app" (a simulator .app)' : '"apk"'} for ${id}`);
        if (ios) apps.push(path.resolve(repo, file));
        else if (options.dryRun) log(`$ install ${file}`);
        else { new Emulator(serial).install(path.resolve(repo, file), id); log(`installed ${id}`); }
      }
      for (const locale of locales) {
        for (const spec of capture.runs || [{}]) {
          const wanted = spec.locales || 'all';
          if (wanted === 'default' ? locale !== defaultLocale : Array.isArray(wanted) && !wanted.includes(locale)) continue;
          const runProfiles = (spec.profiles || captureProfiles).filter(name => !options.profile || name === options.profile);
          if (!runProfiles.length) continue;
          if (options.dryRun) { log(`$ tour ${path.relative(repo, tour)} --locale ${locale} --profile ${runProfiles.join(',')}`); continue; }
          const tourOptions = Object.fromEntries(Object.entries(spec.options || {}).map(([key, value]) => [key, typeof value === 'string' ? expand(value) : value]));
          const attempts = (capture.retries ?? 2) + 1;
          for (let attempt = 1; ; attempt++) {
            try { await runTour(tour, {listing, locale, profiles: runProfiles, serial, simulator, install: apps, options: tourOptions, log}); break; }
            catch (error) {
              if (attempt === attempts) throw error;
              log(`Capture failed (${(error as Error).message.split('\n')[0]}); reset the ${ios ? 'simulators' : 'emulator'} and try again (${attempt + 1}/${attempts})`);
              if (ios) for (const sim of sims) { const found = findSimulator(sim); new Simulator(found.udid, found.name).reset(); }
              else new Emulator(serial).reset();
            }
          }
        }
      }
    }
    if (options.export !== false) {
      // One language's export failing (copy that no longer fits, say) does not stop the others.
      result.failedExports = locales.filter(locale => {
        if (capture.export) return !run(capture.export.replaceAll('{locale}', locale), {check: false});
        const args = [path.join(STUDIO_DIR, 'studio.cjs'), 'export', '--listing', listing, '--locale', locale];
        log(`\n$ ${[process.execPath, ...args].join(' ')}`);
        return !options.dryRun && spawnSync(process.execPath, args, {cwd: repo, env, stdio: 'inherit'}).status !== 0;
      });
      if (result.failedExports.length) throw new Error(`Export failed for ${result.failedExports.join(', ')}; captures are in place. Fix those and export again.`);
      for (const command of capture.after || []) run(command);
    }
    log(`\nRecaptured ${locales.join(', ')}${options.dryRun ? ' (dry run)' : ''}.`);
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

/** `recapture [locale…] [--profile phone] [--simulator name] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]` */
export async function run(argv: string[]): Promise<number> {
  const flag = (name: string) => argv.includes(`--${name}`);
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const values = new Set(['profile', 'serial', 'simulator', 'listing'].map(option).filter(Boolean));
  const result = await recapture({
    locales: argv.filter(word => !word.startsWith('--') && !values.has(word)), profile: option('profile'), serial: option('serial'), simulator: option('simulator'),
    listing: option('listing'), boot: flag('boot'), build: !flag('no-build'), capture: !flag('no-capture'), export: !flag('no-export'),
    dryRun: flag('dry-run'),
  });
  if (result.error) console.error(result.error);
  return result.ok ? 0 : 1;
}
