// Running a tour (store-listing/capture.tour.mjs, a `Tour`): for one language, every capture profile and theme, with
// the device set up before and put back after. agent-device reads and drives the app on an Android emulator or iOS
// simulators alike; emulator.ts and simulator.ts set each device up.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Profiles, StudioConfig, Tour, TourDevice, TourStep} from '../../core/types';
import {spawnSync} from 'node:child_process';
import {missingEmulator} from '../recapture';
import {STUDIO_DIR} from '../project';
import {Emulator, SCALES, sleep} from './emulator';
import {goBack, matcher, openApp, readTree, swipePoints, TapMap, tapNode, tapPoint, type Target, type TreeNode, typeText} from './screen';
import {appleLanguage, Simulator} from './simulator';

export interface TourOptions {
  listing: string;
  locale: string;
  /** Capture only these profiles (default: every profile with a capture size). */
  profiles?: string[];
  /** Save only these scenes (by name); the others are still reached. */
  only?: string[];
  /** The capture emulator (Android). */
  serial?: string;
  /** iOS: the simulator for profiles that name none (profiles.json "simulator"). */
  simulator?: string;
  /** iOS: simulator apps (.app) to install on each simulator before capturing. */
  install?: string[];
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
  const ios = config.capture?.platform === 'ios';
  // Android profiles have a capture size and density; iOS ones a capture size and the simulator that has it.
  const sizes = Object.entries(profiles).filter(([name, p]) => p.captureWidth && p.captureHeight && (ios ? p.platform === 'ios' : p.captureDensity && p.platform !== 'ios')
    && (!options.profiles?.length || options.profiles.includes(name)));
  if (!sizes.length) throw new Error(`No profile to capture${options.profiles?.length ? ` among ${options.profiles.join(', ')}` : ''}: give one captureWidth and captureHeight, `
    + (ios ? 'with "platform": "ios" and its "simulator",' : 'and captureDensity,') + ' in profiles.json.');

  let emu: Emulator | null = null;
  const sims = new Map<string, Simulator>();
  let sim: Simulator | null = null;
  if (!ios) {
    const serial = options.serial || '';
    const problem = missingEmulator(serial);
    if (problem) throw new Error(problem);
    emu = new Emulator(serial);
    if (tour.battery !== undefined) emu.battery = tour.battery;
    if (!emu.isEmulator()) throw new Error(`${serial} is not an emulator. Captures run only on emulators, never on a phone.`);
  }
  const android = () => { if (!emu) throw new Error('This is Android only: the tour is capturing on iOS simulators.'); return emu; };
  const simulator = () => { if (!sim) throw new Error('This is iOS only: the tour is capturing on an Android emulator.'); return sim; };
  /** The device agent-device reads and drives, for the profile being captured. */
  let target: Target = ios ? {platform: 'ios', udid: ''} : {platform: 'android', serial: options.serial || ''};
  const screenshot = () => ios ? simulator().screenshot() : android().screenshot();
  /** iOS: the .app the tour or studio.json installs, to install on each simulator and to start afresh from. */
  const apps = [...(options.install || []), ...(tour.install ? [path.resolve(options.listing, tour.install)] : [])];
  const appLocale = tour.appLocale !== false, offline = tour.offline !== false;
  const recording = options.locale === defaultLocale;
  const mapFile = path.join(options.listing, defaultLocale, 'raw', 'tap-map.json');
  const taps = tour.tapMap === false ? null : new TapMap(mapFile, recording, file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  const written: string[] = [];
  let profile = '';

  /** Where a label may be: a band of the screen (fractions of its height) and any test of the bounds. */
  const region = ({above, below, within}: {above?: number; below?: number; within?: (b: TreeNode['b']) => boolean}) =>
    above === undefined && below === undefined && !within ? undefined
      : (b: TreeNode['b']) => (above === undefined || b[1] < d.height * above) && (below === undefined || b[1] >= d.height * below) && (!within || within(b));
  const slotOf = (kind: string, label: string | RegExp, key?: string) => `${profile}|${d.theme}|${kind}${key || (typeof label === 'string' ? label : label.source)}`;
  const where = () => `(${options.locale}, ${profile}, ${d.theme})`;

  const d: TourDevice = {
    app: tour.app, platform: ios ? 'ios' : 'android', locale: options.locale, defaultLocale, profile: '', width: 0, height: 0, theme: 'light',
    serial: options.serial || '', options: options.options || {},
    raw: path.join(options.listing, options.locale, 'raw'),
    async settle(max = 4000) {
      // Settled when two frames in a row are the same: transitions, ripples and lists coming to rest all count.
      let last = screenshot();
      for (const end = Date.now() + max; Date.now() < end;) {
        await sleep(250);
        const frame = screenshot();
        if (frame.equals(last)) return;
        last = frame;
      }
    },
    async waitUntil(test, {timeout = 30_000, interval = 1000, message} = {}) {
      for (const end = Date.now() + timeout; ; await sleep(interval)) {
        if (await test()) return;
        if (Date.now() > end) throw new Error(`${message || 'What the tour waits for never happened'} ${where()}`);
      }
    },
    async launch({clear = false, wait = 0, activity = tour.activity, extras = {}} = {}) {
      if (ios) {
        const device = simulator();
        // iOS keeps no "clear data": a fresh install is a fresh start.
        if (clear && apps.length) { device.try('uninstall', device.udid, tour.app); for (const app of apps) device.install(app); }
        // Extras become launch arguments the app reads with UserDefaults: -screenshotScene settings.
        const args = Object.entries(extras).flatMap(([key, value]) => [`-${key}`, typeof value === 'boolean' ? (value ? 'YES' : 'NO') : String(value)]);
        await openApp(target, tour.app, [...args, ...(appLocale ? appleLanguage(options.locale) : [])]);
      } else {
        const emu = android();
        if (clear) {
          emu.shell('am', 'force-stop', tour.app);
          emu.shell('pm', 'clear', tour.app);
          if (appLocale) emu.appLocale(tour.app, options.locale);
        }
        const component = activity ? (activity.includes('/') ? activity : `${tour.app}/${activity}`) : null;
        const flags = Object.entries(extras).flatMap(([key, value]) => [typeof value === 'boolean' ? '--ez' : typeof value === 'number' ? '--ei' : '--es', key, String(value)]);
        // Started and in front: a slow first start can leave another app on top, so it is started again.
        for (let attempt = 0; ; attempt++) {
          emu.shell('am', 'force-stop', tour.app);
          if (component) emu.shell('am', 'start', '-W', '-n', component, ...flags);
          else emu.shell('monkey', '-p', tour.app, '-c', 'android.intent.category.LAUNCHER', '1');
          try { await d.waitUntil(() => d.topActivity().includes(tour.app), {timeout: 15_000, interval: 500}); break; }
          catch { if (attempt === 2) throw new Error(`${tour.app} did not come to the front ${where()}`); }
        }
      }
      await sleep(wait);
      await d.settle(6000);
    },
    async tap(label, {textOnly = false, timeout = 10_000, wait = 0, key, above, below, within} = {}) {
      const matches = matcher(label, textOnly, region({above, below, within}));
      const slot = slotOf('', label, key);
      // Waits for the element; in another language, for the element where the default language found it.
      let node: TreeNode | undefined;
      for (const end = Date.now() + timeout; !node; await sleep(500)) {
        try {
          const {nodes} = await readTree(target);
          node = taps ? taps.resolve(slot, nodes, matches) : nodes.find(matches);
          if (!node) throw new Error(`Nothing on screen matches "${label}"`);
        } catch (error) {
          if (Date.now() > end) throw new Error(`${(error as Error).message} ${where()}. npx screenshot-studio screen shows what is there.`);
        }
      }
      await tapNode(target, node);
      await sleep(wait);
      await d.settle();
    },
    async tapAt(x, y) { if (ios) await tapPoint(target, x, y); else android().shell('input', 'tap', Math.round(x), Math.round(y)); await d.settle(); },
    async isVisible(label, {textOnly = false, above, below} = {}) { return (await readTree(target)).nodes.some(matcher(label, textOnly, region({above, below}))); },
    async waitFor(label, {textOnly = false, timeout = 10_000, key} = {}) {
      // Like taps, the default language records the element's path and the others wait for that path.
      const slot = slotOf('wait ', label, key);
      const path = taps && !taps.recording ? taps.take(slot) : undefined;
      const matches = path ? (node: TreeNode) => node.path === path : matcher(label, textOnly);
      for (const end = Date.now() + timeout; Date.now() < end; await sleep(500)) {
        const node = (await readTree(target)).nodes.find(matches);
        if (node) { if (taps?.recording) taps.put(slot, node.path); return; }
      }
      throw new Error(`"${label}" never appeared ${where()}.`);
    },
    async back() { if (ios) await goBack(target); else android().shell('input', 'keyevent', 'KEYCODE_BACK'); await d.settle(); },
    async scroll(fraction = .5, {start = .8, x = .5, up = false, duration = 300} = {}) {
      const [a, b] = up ? [start - fraction, start] : [start, start - fraction];
      await d.swipe(d.width * x, d.height * a, d.width * x, d.height * b, {duration});
    },
    async drag(distance) {
      const start = Math.floor(d.height * .8);
      await d.swipe(Math.floor(d.width / 2), start, Math.floor(d.width / 2), start - distance, {duration: 1400});
    },
    async scrollTo(label, top, {textOnly = false, key} = {}) {
      const attempts = 12;
      // A drag scrolls its length less the touch slop (8dp): add it, or a short correction never moves the list.
      // (iOS starts scrolling after a 10-point move.)
      const slop = ios ? Math.round(10 * d.width / 400) : Math.round(8 * android().density / 160), goal = d.height * top;
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
          const node = (await readTree(target)).nodes.find(matches);
          if (!node) { if (!search) return null; await move(d.height * .5); continue; }
          const y = node.b[1];
          // Close enough, or the list can't scroll any further.
          if (Math.abs(y - goal) <= 8 || y === last) return node;
          last = y;
          await move(y - goal);
        }
        return null;
      };
      // Labels are translated: the default language records how far the list went and the element's path at the
      // end; the others scroll as far, then line that element up.
      const slot = slotOf('scroll ', label, key);
      if (taps && !taps.recording) {
        const [distance, path] = taps.take(slot).split(' ');
        for (let left = Number(distance); Math.abs(left) > 8;) { const step = left > 0 ? Math.min(left, Math.floor(d.height * .55)) : left; await move(step); left -= step; }
        await align(node => node.path === path, false);
        return;
      }
      const node = await align(matcher(label, textOnly), true);
      if (!node) throw new Error(`Could not scroll to "${label}" ${where()}.`);
      taps?.put(slot, `${scrolled} ${node.path}`);
    },
    appFiles: () => android().try('run-as', tour.app, 'ls', 'files'),
    topActivity: () => android().try('dumpsys', 'activity', 'activities').split('topResumedActivity=').slice(1).join('').slice(0, 200),
    async swipe(x1, y1, x2, y2, {duration = 300} = {}) {
      if (ios) await swipePoints(target, x1, y1, x2, y2, duration);
      else android().shell('input', 'swipe', ...[x1, y1, x2, y2].map(Math.round), duration);
      await d.settle();
    },
    async type(text) {
      if (ios) await typeText(target, text);
      else android().shell('input', 'text', text.replace(/ /g, '%s').replace(/([\\'"&|<>;()$`])/g, '\\$1'));
      await d.settle();
    },
    async night(on) {
      const device = ios ? simulator() : android();
      await device.night(on); d.theme = device.theme; device.statusBar();
    },
    async rotate(landscape) {
      await android().rotate(landscape);
      const short = Math.min(d.width, d.height), long = Math.max(d.width, d.height);
      d.width = landscape ? long : short; d.height = landscape ? short : long;
      target = {...target, width: d.width};
    },
    async resize(width, height, density) { const emu = android(); await emu.resize(width, height, density ?? emu.density); d.width = width; d.height = height; target = {...target, width}; },
    setClock(hhmm) { android().setClock(hhmm); },
    async openUrl(url) { simulator().simctl('openurl', simulator().udid, url); await d.settle(); },
    privacy(action, service) { simulator().simctl('privacy', simulator().udid, action, service, tour.app); },
    simctl: (...words) => simulator().simctl(...words),
    async shot(name, {settle = 0, animated = false, check}: {settle?: number; animated?: boolean; check?: (nodes: TreeNode[]) => boolean | void} = {}) {
      await d.settle();
      await sleep(settle);
      const relative = path.posix.join(options.locale, 'raw', profile, `${name}.png`);
      if (options.only?.length && !options.only.includes(name)) return null;
      // The layout first (with animations off it reads a still screen), then, for animated scenes, a frame of the motion.
      const tree = await readTree(target);
      if (tree.dialog) throw new Error(`${relative}: a system dialog is on screen: ${tree.dialog}`);
      if (check && check(tree.nodes) === false) throw new Error(`${relative}: the screen failed its check`);
      if (tour.check && tour.check(tree.nodes, d) === false) throw new Error(`${relative}: the screen failed the tour's check`);
      // (iOS keeps its animations on: an animated scene there is just a later frame.)
      const motion = animated && emu;
      if (motion) for (const key of SCALES) emu!.setting('global', key, '1');
      if (animated) await sleep(4500);
      let png: Buffer;
      try { png = screenshot(); } finally { if (motion) for (const key of SCALES) emu!.setting('global', key, '0'); }
      const size = {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
      if (size.width !== d.width || size.height !== d.height)
        throw new Error(`${relative} came out ${size.width}×${size.height}, not the ${profile} size ${d.width}×${d.height}: the display did not take the profile's size.`);
      const file = path.join(options.listing, relative);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, png);
      fs.writeFileSync(file.replace(/\.png$/, '.nodes.json'), JSON.stringify({source: 'agent-device', width: size.width, height: size.height, nodes: tree.nodes}) + '\n');
      written.push(relative);
      log(`captured  ${relative}`);
      return relative;
    },
    async tree() { return (await readTree(target)).nodes; },
    studio(...args) {
      const run = spawnSync(process.execPath, [path.join(STUDIO_DIR, 'studio.cjs'), ...args], {cwd: options.listing, stdio: 'inherit'});
      if (run.status !== 0) throw new Error(`screenshot-studio ${args.join(' ')} failed`);
    },
    shell: (...words) => android().shell(...words),
    adb: (...words) => android().adb(...words),
    sleep: ms => sleep(ms).then(() => undefined),
  };

  const step = async (fn: TourStep | null | undefined) => fn ? fn(d) : undefined;
  try {
    if (emu) {
      emu.prepare({offline, animations: tour.animations !== false});
      if (tour.install) emu.install(path.resolve(options.listing, tour.install), tour.app);
      if (appLocale) emu.appLocale(tour.app, options.locale);
    }
    await step(tour.setup);
    for (const [name, p] of sizes) {
      profile = d.profile = name;
      d.width = p.captureWidth!; d.height = p.captureHeight!;
      if (emu) {
        // The display takes the capture size as is: 1920×1200 is a landscape display, no rotation needed.
        await emu.resize(p.captureWidth!, p.captureHeight!, p.captureDensity!);
        target = {platform: 'android', serial: emu.serial, width: d.width};
      } else {
        // Each iOS profile captures on its own simulator: booted, prepared and given the app once.
        const wanted = p.simulator || options.simulator || config.capture?.simulator;
        if (!wanted) throw new Error(`No simulator for ${name}: set "simulator" on the profile in profiles.json, or "capture": {"simulator": "…"} in studio.json`);
        if (!sims.has(wanted)) {
          log(`simulator ${wanted}`);
          const opened = Simulator.open(wanted);
          if (tour.battery !== undefined) opened.battery = tour.battery;
          sims.set(wanted, opened);
          opened.prepare();
          for (const app of apps) opened.install(app);
        }
        sim = sims.get(wanted)!;
        d.serial = sim.udid;
        target = {platform: 'ios', udid: sim.udid, width: d.width};
      }
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
    if (taps?.recording) { fs.mkdirSync(path.dirname(mapFile), {recursive: true}); fs.writeFileSync(mapFile, taps.json()); }
    const failures = [...(emu ? emu.restore({pkg: tour.app, appLocale, offline, uninstall: tour.uninstall}) : []),
      ...[...sims.values()].flatMap(device => device.restore({bundle: tour.app, uninstall: tour.uninstall}))];
    for (const failure of failures) log(`cleanup: ${failure}`);
  }
  return written;
}
