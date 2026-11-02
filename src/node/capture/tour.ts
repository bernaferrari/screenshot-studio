// Running a tour (store-listing/capture.tour.mjs, a `Tour`): for one language, every capture profile and theme, with
// the emulator set up before and put back after. agent-device reads and drives the app; emulator.ts sets the device.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Profiles, StudioConfig, Tour, TourDevice, TourStep} from '../../core/types';
import {spawnSync} from 'node:child_process';
import {missingEmulator} from '../recapture';
import {STUDIO_DIR} from '../project';
import {Emulator, SCALES, sleep} from './emulator';
import {matcher, readTree, TapMap, tapNode, type TreeNode} from './screen';

export interface TourOptions {
  listing: string;
  locale: string;
  /** Capture only these profiles (default: every profile with a capture size). */
  profiles?: string[];
  /** Save only these scenes (by name); the others are still reached. */
  only?: string[];
  serial: string;
  /** The run's options (studio.json "capture": {"runs": [{"options": …}]}). */
  options?: Record<string, unknown>;
  log?: (line: string) => void;
}

export async function loadTour(file: string): Promise<Tour> {
  const tour = (await import(`${pathToFileURL(path.resolve(file)).href}?${fs.statSync(file).mtimeMs}`)).default as Tour;
  if (!tour?.app || (!tour.scenes && !tour.run)) throw new Error(`${file} must export default {app, scenes} (see the Tour type in studio/types.d.ts).`);
  return tour;
}

/** Run a tour for one language; returns the captures written, relative to the listing. */
export async function runTour(file: string, options: TourOptions): Promise<string[]> {
  const log = options.log || ((line: string) => console.log(line));
  const tour = await loadTour(file);
  const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(options.listing, relative), 'utf8'));
  const config: StudioConfig = read('studio.json'), profiles: Profiles = read('profiles.json');
  const defaultLocale = config.defaultLocale || 'en-US';
  const sizes = Object.entries(profiles).filter(([name, p]) => p.captureWidth && p.captureHeight && p.captureDensity && (!options.profiles?.length || options.profiles.includes(name)));
  if (!sizes.length) throw new Error(`No profile to capture${options.profiles?.length ? ` among ${options.profiles.join(', ')}` : ''}: give one captureWidth, captureHeight and captureDensity in profiles.json.`);

  const problem = missingEmulator(options.serial);
  if (problem) throw new Error(problem);
  const emu = new Emulator(options.serial);
  if (tour.battery !== undefined) emu.battery = tour.battery;
  if (!emu.isEmulator()) throw new Error(`${options.serial} is not an emulator. Captures run only on emulators, never on a phone.`);
  const appLocale = tour.appLocale !== false, offline = tour.offline !== false;
  const recording = options.locale === defaultLocale;
  const mapFile = path.join(options.listing, defaultLocale, 'raw', 'tap-map.json');
  const taps = tour.tapMap === false ? null : new TapMap(mapFile, recording, file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  const written: string[] = [];
  let profile = '';

  const d: TourDevice = {
    app: tour.app, locale: options.locale, defaultLocale, profile: '', width: 0, height: 0, theme: 'light', serial: options.serial, options: options.options || {},
    raw: path.join(options.listing, options.locale, 'raw'),
    async launch({clear = false, wait = 4000, activity = tour.activity, extras = {}} = {}) {
      emu.shell('am', 'force-stop', tour.app);
      if (clear) {
        emu.shell('pm', 'clear', tour.app);
        if (appLocale) emu.appLocale(tour.app, options.locale);
      }
      const component = activity ? (activity.includes('/') ? activity : `${tour.app}/${activity}`) : null;
      const flags = Object.entries(extras).flatMap(([key, value]) => [typeof value === 'boolean' ? '--ez' : typeof value === 'number' ? '--ei' : '--es', key, String(value)]);
      if (component) emu.shell('am', 'start', '-W', '-n', component, ...flags);
      else emu.shell('monkey', '-p', tour.app, '-c', 'android.intent.category.LAUNCHER', '1');
      await sleep(wait);
    },
    async tap(label, {textOnly = false, wait = 1500, attempts = 6, key, within} = {}) {
      const matches = matcher(label, textOnly, within);
      const slot = `${profile}|${d.theme}|${key || (typeof label === 'string' ? label : label.source)}`;
      let node: TreeNode | undefined, last: unknown;
      for (let attempt = 0; attempt < attempts && !node; attempt++) {
        try {
          const {nodes} = await readTree(options.serial);
          node = taps ? taps.resolve(slot, nodes, matches) : nodes.find(matches);
          if (!node) throw new Error(`Nothing on screen matches "${label}"`);
        } catch (error) { last = error; await sleep(1200); }
      }
      if (!node) throw new Error(`${(last as Error).message} (${options.locale}, ${profile}, ${d.theme}). npx screenshot-studio screen shows what is there.`);
      await tapNode(options.serial, node);
      await sleep(wait);
    },
    async tapAt(x, y, wait = 1500) { emu.shell('input', 'tap', Math.round(x), Math.round(y)); await sleep(wait); },
    async present(label, {textOnly = false} = {}) { return (await readTree(options.serial)).nodes.some(matcher(label, textOnly)); },
    async waitFor(label, {textOnly = false, timeout = 10_000, key} = {}) {
      // Like taps, the default language records the element's path and the others wait for that path.
      const slot = `${profile}|${d.theme}|wait ${key || (typeof label === 'string' ? label : label.source)}`;
      const path = taps && !taps.recording ? taps.take(slot) : undefined;
      const matches = path ? (node: TreeNode) => node.path === path : matcher(label, textOnly);
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(500)) {
        const node = (await readTree(options.serial)).nodes.find(matches);
        if (node) { if (taps?.recording) taps.put(slot, node.path); return; }
      }
      throw new Error(`"${label}" never appeared (${options.locale}, ${profile}, ${d.theme}).`);
    },
    async back(wait = 1200) { emu.shell('input', 'keyevent', 'KEYCODE_BACK'); await sleep(wait); },
    async scroll(fraction = .5, {start = .8, x = .5, up = false, duration = 300, wait = 1200} = {}) {
      const [a, b] = up ? [start - fraction, start] : [start, start - fraction];
      await d.swipe(d.width * x, d.height * a, d.width * x, d.height * b, {duration, wait});
    },
    async drag(distance, wait = 1200) {
      const start = Math.floor(d.height * .8);
      await d.swipe(Math.floor(d.width / 2), start, Math.floor(d.width / 2), start - distance, {duration: 1400, wait});
    },
    async scrollTo(label, top, {textOnly = false, attempts = 12, key} = {}) {
      // A drag scrolls its length less the touch slop (8dp): add it, or a short correction never moves the list.
      const slop = Math.round(8 * emu.density / 160), target = d.height * top;
      let scrolled = 0;
      const move = async (distance: number) => {
        if (distance > 0) await d.drag(Math.min(Math.floor(distance), Math.floor(d.height * .55)) + slop);
        else await d.swipe(d.width / 2, d.height * .3, d.width / 2, d.height * .3 - distance + slop, {duration: 1400});
        scrolled += distance > 0 ? Math.min(Math.floor(distance), Math.floor(d.height * .55)) : distance;
      };
      // Bring the matching element to the target height; false when none shows up.
      const align = async (matches: (node: TreeNode) => boolean, search: boolean) => {
        let last: number | undefined;
        for (let i = 0; i < attempts; i++) {
          const node = (await readTree(options.serial)).nodes.find(matches);
          if (!node) { if (!search) return null; await move(d.height * .5); continue; }
          const y = node.b[1];
          // Close enough, or the list can't scroll any further.
          if (Math.abs(y - target) <= 8 || y === last) return node;
          last = y;
          await move(y - target);
        }
        return null;
      };
      // Labels are translated: the default language records how far the list went and the element's path at the
      // end; the others scroll as far, then line that element up.
      const slot = `${profile}|${d.theme}|scroll ${key || (typeof label === 'string' ? label : label.source)}`;
      if (taps && !taps.recording) {
        const [distance, path] = taps.take(slot).split(' ');
        for (let left = Number(distance); Math.abs(left) > 8;) { const step = left > 0 ? Math.min(left, Math.floor(d.height * .55)) : left; await move(step); left -= step; }
        await align(node => node.path === path, false);
        return;
      }
      const node = await align(matcher(label, textOnly), true);
      if (!node) throw new Error(`Could not scroll to "${label}" (${options.locale}, ${profile}, ${d.theme}).`);
      taps?.put(slot, `${scrolled} ${node.path}`);
    },
    appFiles: () => emu.try('run-as', tour.app, 'ls', 'files'),
    topActivity: () => emu.try('dumpsys', 'activity', 'activities').split('topResumedActivity=').slice(1).join('').slice(0, 200),
    async swipe(x1, y1, x2, y2, {duration = 300, wait = 1200} = {}) {
      emu.shell('input', 'swipe', ...[x1, y1, x2, y2].map(Math.round), duration);
      await sleep(wait);
    },
    async type(text) { emu.shell('input', 'text', text.replace(/ /g, '%s').replace(/([\\'"&|<>;()$`])/g, '\\$1')); await sleep(500); },
    async night(on) { await emu.night(on); d.theme = emu.theme; emu.statusBar(); },
    async rotate(landscape) { await emu.rotate(landscape); },
    async resize(width, height, density = emu.density) { await emu.resize(width, height, density); d.width = width; d.height = height; },
    setClock(hhmm) { emu.setClock(hhmm); },
    async shot(name, {settle = 1200, animated = false, check}: {settle?: number; animated?: boolean; check?: (nodes: TreeNode[]) => boolean | void} = {}) {
      await sleep(settle);
      const relative = path.posix.join(options.locale, 'raw', profile, `${name}.png`);
      if (options.only?.length && !options.only.includes(name)) return null;
      // The layout first (with animations off it reads a still screen), then, for animated scenes, a frame of the motion.
      const tree = await readTree(options.serial);
      if (tree.dialog) throw new Error(`${relative}: a system dialog is on screen: ${tree.dialog}`);
      if (check && check(tree.nodes) === false) throw new Error(`${relative}: the screen failed its check`);
      if (tour.check && tour.check(tree.nodes, d) === false) throw new Error(`${relative}: the screen failed the tour's check`);
      if (animated) { for (const key of SCALES) emu.setting('global', key, '1'); await sleep(4500); }
      let png: Buffer;
      try { png = emu.screenshot(); } finally { if (animated) for (const key of SCALES) emu.setting('global', key, '0'); }
      const size = {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
      if (size.width !== d.width || size.height !== d.height)
        throw new Error(`${relative} came out ${size.width}×${size.height}, not the ${profile} size ${d.width}×${d.height}: the display did not take the profile's size.`);
      const target = path.join(options.listing, relative);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, png);
      fs.writeFileSync(target.replace(/\.png$/, '.nodes.json'), JSON.stringify({source: 'agent-device', width: size.width, height: size.height, nodes: tree.nodes}) + '\n');
      written.push(relative);
      log(`captured  ${relative}`);
      return relative;
    },
    async tree() { return (await readTree(options.serial)).nodes; },
    studio(...args) {
      const run = spawnSync(process.execPath, [path.join(STUDIO_DIR, 'studio.cjs'), ...args], {cwd: options.listing, stdio: 'inherit'});
      if (run.status !== 0) throw new Error(`screenshot-studio ${args.join(' ')} failed`);
    },
    shell: (...words) => emu.shell(...words),
    adb: (...words) => emu.adb(...words),
    sleep: ms => sleep(ms).then(() => undefined),
  };

  const step = async (fn: TourStep | null | undefined) => fn ? fn(d) : undefined;
  try {
    emu.prepare({offline, animations: tour.animations !== false});
    if (tour.install) emu.install(path.resolve(options.listing, tour.install), tour.app);
    if (appLocale) emu.appLocale(tour.app, options.locale);
    await step(tour.setup);
    for (const [name, p] of sizes) {
      profile = d.profile = name;
      // The display takes the capture size as is: 1920×1200 is a landscape display, no rotation needed.
      await emu.resize(p.captureWidth!, p.captureHeight!, p.captureDensity!);
      d.width = p.captureWidth!; d.height = p.captureHeight!;
      if (tour.run) { await step(tour.run); continue; }
      const scenesHere = tour.profiles?.[name] || tour.scenes;
      for (const theme of ['light', 'dark'] as const) {
        const scenes = scenesHere[theme];
        if (!scenes) continue;
        await d.night(theme === 'dark');
        await (tour.start ? step(tour.start) : d.launch({clear: true}));
        for (const [scene, reach] of Object.entries(scenes)) if ((await step(reach)) !== false) await d.shot(scene, {settle: tour.settle, animated: tour.animated?.includes(scene)});
      }
    }
  } finally {
    // Teardown runs even after a failure: it undoes what setup did (fixtures, a host's desktop).
    try { await step(tour.teardown); } catch (error) { log(`teardown: ${(error as Error).message}`); }
    if (taps?.recording) fs.writeFileSync(mapFile, taps.json());
    for (const failure of emu.restore({pkg: tour.app, appLocale, offline, uninstall: tour.uninstall})) log(`cleanup: ${failure}`);
  }
  return written;
}
