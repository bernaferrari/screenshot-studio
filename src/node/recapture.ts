/**
 * Rebuild the capture app, capture on the emulator, and export, as studio.json's "capture" block says:
 *   node store-listing/studio/recapture.cjs [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]
 * Without locales every locale in studio.json is exported, and captured where a run asks for it.
 *
 *   "capture": {
 *     "build": "./gradlew :app:assembleStoreCapture",               shell command, run from the repository
 *     "install": [{"apk": "app/build/…/app-storeCapture.apk", "package": "com.example.storecapture"}],
 *     "runs": [{"script": "store-listing/capture-emulator.py",      (the default)
 *               "args": ["--theme", "dark"],                         ${NAME} reads an environment variable
 *               "profiles": ["phone", "tablet7"],                    default: every capture profile; false: no --profile
 *               "locales": "default"}],                              "all" (default), "default" or a list
 *     "retries": 2,                                                  per capture run
 *     "serial": "emulator-5578",                                     the capture emulator (or CAPTURE_SERIAL)
 *     "avd": "Pixel_9_API_36",                                       what --boot starts when it isn't running
 *     "export": "cd store-listing && node render.mjs --locale {locale}",  instead of studio/export.cjs, per locale
 *     "after": ["python3 store-listing/prepare.py"]                  shell commands once everything is exported
 *   }
 *
 * Each run is `python3 <script> --serial <emulator> --locale <locale> [--profile <profile>] <args>`, through
 * `uv run --with pillow` when uv is installed. The default locale goes first, since it records the tap map
 * other locales replay. --boot starts the capture emulator headless when it isn't running and waits for it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {loadListing} from './project';

export interface RecaptureOptions {
  listing?: string;
  /** Only these languages (default: every language in studio.json). */
  locales?: string[];
  /** Only this capture profile. */
  profile?: string;
  serial?: string;
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

export const DEFAULT_SERIAL = 'emulator-5578';

const sdkRoot = () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  [path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')].find(dir => fs.existsSync(dir)) || '';
const has = (command: string) => spawnSync('sh', ['-c', `command -v ${command}`], {stdio: 'ignore'}).status === 0;
const adb = (serial: string, ...args: string[]) => spawnSync('adb', ['-s', serial, ...args], {encoding: 'utf8'});

/** Whether the emulator is attached and has finished booting. */
export function booted(serial: string): boolean {
  return adb(serial, 'shell', 'getprop', 'sys.boot_completed').stdout?.trim() === '1';
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
  const listing = options.listing ? path.resolve(options.listing) : path.resolve(__dirname, '..');
  const {config, profiles, repo, defaultLocale, locales: configured} = loadListing(listing);
  const capture = config.capture;
  const locales = options.locales?.length ? [...options.locales] : [...configured];
  const result: RecaptureResult = {ok: false, locales, failedExports: []};
  try {
    if (!capture) throw new Error('studio.json has no "capture" block; see docs/capture.md');
    const serial = options.serial || capture.serial || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL;
    if (!serial.startsWith('emulator-')) throw new Error('Use a capture emulator, never a physical phone.');
    const unknown = locales.filter(locale => !configured.includes(locale));
    if (unknown.length) throw new Error(`Not in studio.json locales: ${unknown.join(', ')}`);
    locales.sort((a, b) => Number(b === defaultLocale) - Number(a === defaultLocale));
    const captureProfiles = Object.keys(profiles).filter(name => profiles[name].captureDensity);
    if (options.profile && !profiles[options.profile]?.captureWidth) throw new Error(`No capture profile ${options.profile} in profiles.json`);

    const python = has('uv') ? ['uv', 'run', '-q', '--with', 'pillow', 'python3'] : ['python3'];
    const env: NodeJS.ProcessEnv = {...process.env, CAPTURE_SERIAL: serial, ANDROID_SERIAL: serial};
    const expand = (word: string) => String(word).replace(/\$\{(\w+)\}/g, (_, name: string) => {
      if (env[name] === undefined) throw new Error(`Set ${name} for this capture (studio.json capture args use it)`);
      return env[name]!;
    });
    const run = (command: string, args: string[] = [], {shell = false, check = true} = {}) => {
      const line = shell ? command : [command, ...args].join(' ');
      log(`\n$ ${line}`);
      if (options.dryRun) return true;
      const done = shell ? spawnSync('sh', ['-c', command], {cwd: repo, env, stdio: 'inherit'})
        : spawnSync(command, args, {cwd: repo, env, stdio: 'inherit'});
      if (done.status !== 0 && check) throw new Error(`Failed (${done.status ?? done.signal}): ${line}`);
      return done.status === 0;
    };

    const studioPy = path.relative(repo, path.join(__dirname, 'capture.py'));
    if (options.build !== false && capture.build) run(capture.build, [], {shell: true});
    if (options.capture !== false) {
      if (options.boot && !options.dryRun) await bootEmulator(serial, capture.avd, log);
      for (const {apk, package: id} of capture.install || []) run(python[0], [...python.slice(1), studioPy, 'install', apk, '--package', id, '--serial', serial]);
      for (const locale of locales) {
        for (const spec of capture.runs || [{}]) {
          const wanted = spec.locales || 'all';
          if (wanted === 'default' ? locale !== defaultLocale : Array.isArray(wanted) && !wanted.includes(locale)) continue;
          const runProfiles = spec.profiles === false ? [null] : (spec.profiles || captureProfiles).filter(name => !options.profile || name === options.profile);
          for (const profile of runProfiles) {
            const args = [...python.slice(1), spec.script || 'store-listing/capture-emulator.py', '--serial', serial, '--locale', locale,
              ...(profile ? ['--profile', profile] : []), ...(spec.args || []).map(expand)];
            const attempts = (capture.retries ?? 2) + 1;
            for (let attempt = 1; ; attempt++) {
              if (run(python[0], args, {check: attempt === attempts})) break;
              log(`Capture failed; reset the emulator and try again (${attempt + 1}/${attempts})`);
              run(python[0], [...python.slice(1), studioPy, 'reset', '--serial', serial]);
            }
          }
        }
      }
    }
    if (options.export !== false) {
      // One language's export failing (copy that no longer fits, say) does not stop the others.
      result.failedExports = locales.filter(locale => !(capture.export
        ? run(capture.export.replaceAll('{locale}', locale), [], {shell: true, check: false})
        : run('node', [path.relative(repo, path.join(__dirname, 'studio.cjs')), 'export', '--locale', locale], {check: false})));
      if (result.failedExports.length) throw new Error(`Export failed for ${result.failedExports.join(', ')}; captures are in place. Fix those and export again.`);
      for (const command of capture.after || []) run(command, [], {shell: true});
    }
    log(`\nRecaptured ${locales.join(', ')}${options.dryRun ? ' (dry run)' : ''}.`);
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

/** `recapture [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]` */
export async function run(argv: string[]): Promise<number> {
  const flag = (name: string) => argv.includes(`--${name}`);
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const values = new Set(['profile', 'serial', 'listing'].map(option).filter(Boolean));
  const result = await recapture({
    locales: argv.filter(word => !word.startsWith('--') && !values.has(word)), profile: option('profile'), serial: option('serial'),
    listing: option('listing'), boot: flag('boot'), build: !flag('no-build'), capture: !flag('no-capture'), export: !flag('no-export'),
    dryRun: flag('dry-run'),
  });
  if (result.error) console.error(result.error);
  return result.ok ? 0 : 1;
}
