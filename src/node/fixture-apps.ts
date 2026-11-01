/**
 * Fictional third-party apps for capture emulators: tiny code-free APKs with a name, a drawn adaptive
 * icon and (optionally) the INTERNET permission, so firewalls, launchers and app pickers list them
 * through the real PackageManager with no fixture code in the app under test.
 *
 *   npx screenshot-studio fixtures store-listing/fixture-apps.json [--install emulator-5578] [--uninstall emulator-5578]
 *
 * Spec: {"apps": [{"package": "app.fernway.maps", "label": "Fernway Maps", "colors": ["#3fb27f", "#1e8a5c"],
 *         "glyph": "map", "tint": "#ffffff", "internet": true, "category": "maps"}]}
 * glyph: a Lucide icon name (resolved from lucide-react in the studio master's node_modules or LUCIDE_DIR),
 * {"svg": "<path d=\"...\"/>"} drawn on a 24-unit stroke grid, or {"text": "Aa"}.
 * category: an android:appCategory value (game, audio, video, image, social, news, maps, productivity).
 * targetSdk (default 34; Android refuses installs below 24), versionCode (1) and versionName ("1.0") set the
 * manifest, for apps that read them (an SDK tracker).
 * Needs the Android SDK (ANDROID_HOME or ~/Library/Android/sdk) and Playwright for the icons.
 * Builds into <spec dir>/.fixture-apps/ (keep it git-ignored) and signs with the local debug keystore; an unchanged
 * spec reuses the APKs already there. --install and --uninstall only ever talk to an emulator, never a phone.
 * buildFixtureApps() does the same from code and returns the packages and APKs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readJson} from './project';
import {launchBrowser} from './playwright';

/** A Lucide icon name, SVG markup on a 24-unit stroke grid, or text. */
type Glyph = string | {svg: string} | {text: string};
export interface FixtureApp {
  package: string;
  label: string;
  /** The background gradient, top to bottom; one colour draws it flat. */
  colors: [string, string?];
  glyph?: Glyph;
  tint?: string;
  strokeWidth?: number;
  internet?: boolean;
  category?: string;
  targetSdk?: number;
  versionCode?: number;
  versionName?: string;
}
export interface FixtureSpec {apps: FixtureApp[]}
/** A Lucide icon's elements: [tag, attributes]. */
type IconNode = [string, Record<string, string | number>][];

/** LUCIDE_DIR, or lucide-react in the studio master's node_modules (studio/ sits beside it). */
function lucideDir(): string | undefined {
  const candidates = [process.env.LUCIDE_DIR, path.join(__dirname, '../node_modules/lucide-react/dist/esm/icons')];
  return candidates.find((dir): dir is string => Boolean(dir) && fs.existsSync(dir!));
}

function glyphMarkup(glyph: Glyph | undefined): string {
  if (glyph && typeof glyph === 'object' && 'svg' in glyph && glyph.svg) return glyph.svg;
  if (typeof glyph !== 'string') return '';
  const dir = lucideDir();
  if (!dir) throw new Error('Lucide icons not found: set LUCIDE_DIR to lucide-react/dist/esm/icons');
  const file = path.join(dir, `${glyph}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`No Lucide icon named ${glyph}`);
  let source = fs.readFileSync(file, 'utf8');
  const alias = source.match(/from '\.\/([\w-]+)\.mjs'/);
  if (!source.includes('__iconData') && alias) source = fs.readFileSync(path.join(dir, `${alias[1]}.mjs`), 'utf8');
  const start = source.indexOf('{', source.indexOf('const __iconData'));
  const literal = source.slice(start, source.indexOf('__iconData.node', start)).trim().replace(/;$/, '');
  // A plain object literal from the installed lucide-react package.
  // eslint-disable-next-line no-new-func
  const elements = (Function(`return (${literal})`)() as {node: IconNode}).node;
  return elements.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
}

/** Adaptive icon layers, 432 px (108 dp at xxxhdpi): a gradient field and a glyph inside the 66 dp safe zone. */
function layers(app: FixtureApp): {background: string; foreground: string} {
  const [top, bottom = top] = app.colors;
  const tint = app.tint || '#ffffff';
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <radialGradient id="h" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="432" height="432" fill="url(#g)"/><rect width="432" height="432" fill="url(#h)"/></svg>`;
  let mark: string;
  if (app.glyph && typeof app.glyph === 'object' && 'text' in app.glyph && app.glyph.text) {
    const size = app.glyph.text.length > 1 ? 104 : 140;
    mark = `<text x="216" y="216" dy=".35em" text-anchor="middle" font-family="Google Sans, Roboto, Helvetica, Arial, sans-serif"
      font-weight="700" font-size="${size}" fill="${tint}">${app.glyph.text}</text>`;
  } else {
    // 24-unit Lucide grid scaled to 168 px, centred.
    mark = `<g transform="translate(132 132) scale(7)" fill="none" stroke="${tint}" stroke-width="${app.strokeWidth || 2.1}"
      stroke-linecap="round" stroke-linejoin="round">${glyphMarkup(app.glyph)}</g>`;
  }
  const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">${mark}</svg>`;
  return {background, foreground};
}

async function renderIcons(apps: FixtureApp[], out: string): Promise<void> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport: {width: 432, height: 432}});
    for (const app of apps) {
      const dir = path.join(out, app.package, 'res', 'drawable-nodpi');
      fs.mkdirSync(dir, {recursive: true});
      for (const [name, svg] of Object.entries(layers(app))) {
        await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
        await page.locator('svg').screenshot({path: path.join(dir, `ic_${name}.png`), omitBackground: true});
      }
    }
  } finally {
    await browser.close();
  }
}

const numeric = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true});

/** The newest build-tools and android.jar in the Android SDK, with an error that says what to install. */
function androidSdk(): {tools: string; androidJar: string} {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    [path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')].find(dir => fs.existsSync(dir));
  if (!sdk || !fs.existsSync(sdk)) throw new Error('No Android SDK found. Set ANDROID_HOME to your Android SDK.');
  const list = (dir: string) => fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const buildTools = list(path.join(sdk, 'build-tools')).filter(v => /^\d/.test(v) && !/rc|preview/i.test(v)).sort(numeric).pop();
  if (!buildTools) throw new Error(`No build-tools in ${sdk}. Install them with the SDK Manager (sdkmanager "build-tools;35.0.0").`);
  const platform = list(path.join(sdk, 'platforms')).filter(p => fs.existsSync(path.join(sdk, 'platforms', p, 'android.jar'))).sort(numeric).pop();
  if (!platform) throw new Error(`No Android platform in ${sdk}. Install one with the SDK Manager (sdkmanager "platforms;android-35").`);
  return {tools: path.join(sdk, 'build-tools', buildTools), androidJar: path.join(sdk, 'platforms', platform, 'android.jar')};
}

/** Build one code-free APK from the rendered icons in <out>/<package>/; returns its path. */
function build(app: FixtureApp, out: string, sdk: {tools: string; androidJar: string}): string {
  const run = (tool: string, ...rest: string[]): Buffer => execFileSync(path.join(sdk.tools, tool), rest, {stdio: ['ignore', 'pipe', 'inherit']});
  const root = path.join(out, app.package);
  fs.mkdirSync(path.join(root, 'res', 'mipmap-anydpi-v26'), {recursive: true});
  fs.writeFileSync(path.join(root, 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_background"/>
  <foreground android:drawable="@drawable/ic_foreground"/>
</adaptive-icon>
`);
  const label = app.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  fs.writeFileSync(path.join(root, 'AndroidManifest.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${app.package}">
  ${app.internet === false ? '' : '<uses-permission android:name="android.permission.INTERNET"/>'}
  <application android:label="${label}" android:icon="@mipmap/ic_launcher" android:hasCode="false"${app.category ? ` android:appCategory="${app.category}"` : ''}/>
</manifest>
`);
  const compiled = path.join(root, 'compiled.zip');
  run('aapt2', 'compile', '--dir', path.join(root, 'res'), '-o', compiled);
  const unsigned = path.join(root, 'unsigned.apk'), aligned = path.join(root, 'aligned.apk');
  run('aapt2', 'link', '-o', unsigned, '-I', sdk.androidJar, '--manifest', path.join(root, 'AndroidManifest.xml'),
    '--min-sdk-version', '26', '--target-sdk-version', String(app.targetSdk || 34),
    '--version-code', String(app.versionCode || 1), '--version-name', app.versionName || '1.0', compiled);
  run('zipalign', '-p', '-f', '4', unsigned, aligned);
  const apk = path.join(out, `${app.package}.apk`);
  // The SDK's public debug keystore; these APKs only ever run on capture emulators.
  const keystore = path.join(os.homedir(), '.android', 'debug.keystore');
  if (!fs.existsSync(keystore)) throw new Error(`No debug keystore at ${keystore}. Build any Android app once (or run keytool) to create it.`);
  run('apksigner', 'sign', '--ks', keystore, '--ks-pass', 'pass:android',
    '--ks-key-alias', 'androiddebugkey', '--key-pass', 'pass:android', '--out', apk, aligned);
  return apk;
}

export interface FixtureAppsOptions {
  /** fixture-apps.json. */
  spec: string;
  /** Build, then install every app on this emulator (emulator-N). */
  install?: string;
  /** Only uninstall every app from this emulator (emulator-N); nothing is built. */
  uninstall?: string;
  /** Progress lines (default: console.log). */
  log?: (line: string) => void;
}

export interface FixtureAppsResult {
  /** Every package in the spec, in order. */
  packages: string[];
  /** The signed APKs (absolute paths); empty when uninstalling. */
  apks: string[];
  /** Whether the APKs were rebuilt (false: the spec was unchanged and its APKs reused). */
  built: boolean;
  /** Packages installed on the emulator. */
  installed: string[];
  /** Packages removed from the emulator (ones that were not installed are skipped). */
  uninstalled: string[];
}

/** Build the spec's fixture APKs (reusing them when the spec is unchanged), and install or uninstall them on an emulator. */
export async function buildFixtureApps(options: FixtureAppsOptions): Promise<FixtureAppsResult> {
  const log = options.log || ((line: string) => console.log(line));
  const specFile = path.resolve(options.spec);
  if (!fs.existsSync(specFile) || !fs.statSync(specFile).isFile()) throw new Error(`No fixture spec at ${specFile}`);
  if (options.install && options.uninstall) throw new Error('Pass --install or --uninstall, not both.');
  const serial = options.install || options.uninstall;
  // The "emulator only" guard: fixture apps never go near a real phone.
  if (serial && !serial.startsWith('emulator-')) throw new Error(`Install fixture apps on a dedicated emulator only (emulator-N), not ${serial}.`);
  const spec = readJson<FixtureSpec>(specFile);
  if (!Array.isArray(spec.apps) || !spec.apps.length) throw new Error(`${specFile} lists no apps: {"apps": [{"package": …, "label": …, "colors": […]}]}`);
  for (const app of spec.apps) {
    if (!app.package || !app.label || !app.colors?.length) throw new Error(`Every app in ${specFile} needs "package", "label" and "colors" (${app.package || app.label || 'unnamed'} doesn't).`);
  }
  const packages = spec.apps.map(app => app.package);
  const result: FixtureAppsResult = {packages, apks: [], built: false, installed: [], uninstalled: []};
  const adb = (...rest: string[]): string => execFileSync('adb', ['-s', serial!, ...rest], {stdio: ['ignore', 'pipe', 'pipe']}).toString();

  if (options.uninstall) {
    for (const id of packages) {
      try { adb('uninstall', id); } catch { continue; /* not installed */ }
      result.uninstalled.push(id);
      log(`removed   ${id}`);
    }
    return result;
  }

  const out = path.join(path.dirname(specFile), '.fixture-apps');
  const apkFor = (app: FixtureApp) => path.join(out, `${app.package}.apk`);
  const fingerprint = JSON.stringify(spec.apps);
  const stamp = path.join(out, 'spec.json');
  const fresh = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === fingerprint && spec.apps.every(app => fs.existsSync(apkFor(app)));
  if (!fresh) {
    const sdk = androidSdk();
    fs.rmSync(out, {recursive: true, force: true});
    fs.mkdirSync(out, {recursive: true});
    await renderIcons(spec.apps, out);
    for (const app of spec.apps) log(`built     ${path.relative(process.cwd(), build(app, out, sdk))}`);
    fs.writeFileSync(stamp, fingerprint);
    result.built = true;
  }
  result.apks = spec.apps.map(apkFor);

  if (options.install) {
    for (const app of spec.apps) {
      try { adb('install', '-r', '-t', apkFor(app)); }
      catch (error) {
        const stderr = String((error as {stderr?: Buffer}).stderr || '').trim();
        throw new Error(`Couldn't install ${app.package} on ${serial}${stderr ? `: ${stderr}` : ''}. Is the emulator running (adb devices)?`);
      }
      result.installed.push(app.package);
      log(`installed ${app.package}`);
    }
  }
  return result;
}

const USAGE = 'Usage: npx screenshot-studio fixtures fixture-apps.json [--install <emulator-serial>] [--uninstall <emulator-serial>]';

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); return 0; }
  const options: Partial<FixtureAppsOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--install' || arg === '--uninstall') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) { console.error(`${arg} needs an emulator serial, e.g. emulator-5578\n${USAGE}`); return 1; }
      options[arg === '--install' ? 'install' : 'uninstall'] = value;
    } else if (arg.startsWith('-') || options.spec) {
      console.error(USAGE);
      return 1;
    } else {
      options.spec = arg;
    }
  }
  if (!options.spec) { console.error(USAGE); return 1; }
  try {
    await buildFixtureApps({...options, spec: options.spec});
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
