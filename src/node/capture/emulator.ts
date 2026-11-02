// The capture emulator's state, set for a capture and put back afterwards: display size and density, rotation,
// System UI demo mode (9:41, full battery and Wi-Fi), night mode, the app's language, the clock, animations,
// connectivity and the helper apps that would show up in a capture. Plain adb; agent-device drives the app.
import {spawnSync} from 'node:child_process';

/** Animation scales, set to 0 or 1 together. */
export const SCALES = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];
const DEMO = 'com.android.systemui.demo';
/** Tool and Play-services packages that would otherwise appear in app lists or pop up during a capture. */
const HELPERS = /com\.(google\.android\.(gms|gsf|apps\.(messaging|photos|wellbeing|youtube\.music|maps))|android\.vending|callstack\.agentdevice\..*)/;

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class Emulator {
  width = 0;
  height = 0;
  density = 0;
  theme: 'light' | 'dark' = 'light';
  private saved = new Map<string, string>();
  private clockSet = false;

  constructor(readonly serial: string) {}

  adb(...words: (string | number)[]): string {
    const run = spawnSync('adb', ['-s', this.serial, ...words.map(String)], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300_000});
    if (run.status !== 0) throw new Error(`adb ${words.join(' ')} failed: ${(run.stderr || run.stdout || '').trim()}`);
    return run.stdout;
  }

  shell(...words: (string | number)[]): string { return this.adb('shell', ...words); }

  /** A shell command that may fail without stopping the capture. */
  try(...words: (string | number)[]): string { try { return this.shell(...words); } catch { return ''; } }

  setting(namespace: 'global' | 'system' | 'secure', key: string, value?: string): string {
    if (value === undefined) { const read = this.try('settings', 'get', namespace, key).trim(); return read === 'null' ? '' : read; }
    this.shell('settings', 'put', namespace, key, value);
    return value;
  }

  /** Whether the serial is an emulator (a phone is refused). */
  isEmulator(): boolean { return (this.try('getprop', 'ro.kernel.qemu') + this.try('getprop', 'ro.boot.qemu')).includes('1'); }

  /** Remember a setting to put back on restore, then set it. */
  private change(namespace: 'global' | 'system', key: string, value: string) {
    if (!this.saved.has(`${namespace}/${key}`)) this.saved.set(`${namespace}/${key}`, this.setting(namespace, key));
    this.setting(namespace, key, value);
  }

  /** Prepare the emulator for a capture: a refused override, settings saved, demo mode allowed, helpers away. */
  prepare(options: {offline: boolean; animations: boolean}) {
    if (/Override/.test(this.try('wm', 'size') + this.try('wm', 'density')))
      throw new Error('The emulator still has a display override from an interrupted run: npx screenshot-studio reset');
    this.try('input', 'keyevent', 'KEYCODE_WAKEUP');
    this.try('wm', 'dismiss-keyguard');
    this.try('cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.gestural');
    this.change('system', 'font_scale', '1.0');
    this.change('global', 'heads_up_notifications_enabled', '0');
    this.change('global', 'auto_time', this.setting('global', 'auto_time') || '1');
    this.change('system', 'accelerometer_rotation', '0');
    this.change('system', 'user_rotation', '0');
    for (const key of SCALES) this.change('global', key, options.animations ? '1' : '0');
    this.setting('global', 'sysui_demo_allowed', '1');
    for (const line of this.try('pm', 'list', 'packages').split(/\s+/)) {
      const name = line.replace(/^package:/, '');
      if (HELPERS.test(name) && !name.startsWith('com.callstack.agentdevice')) this.try('pm', 'uninstall', '--user', '0', name);
    }
    this.try('cmd', 'notification', 'snooze', '--for', '3600000', 'all');
    if (options.offline) { this.try('svc', 'wifi', 'disable'); this.try('svc', 'data', 'disable'); }
  }

  demo(command: string, extras: Record<string, string | number> = {}) {
    this.try('am', 'broadcast', '-a', DEMO, '--es', 'command', command, ...Object.entries(extras).flatMap(([key, value]) => ['--es', key, String(value)]));
  }

  /** Demo mode: 9:41, a full battery, full Wi-Fi, no mobile signal, SIM, airplane icon or notifications. */
  statusBar(battery = 100) {
    this.demo('exit');
    this.demo('enter');
    this.demo('clock', {hhmm: '0941'});
    this.demo('battery', {level: battery, plugged: 'false'});
    this.demo('notifications', {visible: 'false'});
    this.demo('network', {wifi: 'show', level: 4, fully: 'true', mobile: 'hide', sims: 0, airplane: 'hide'});
  }

  async resize(width: number, height: number, density: number, settle = 2000) {
    this.demo('exit');
    this.shell('wm', 'size', `${width}x${height}`);
    this.shell('wm', 'density', density);
    Object.assign(this, {width, height, density});
    await sleep(settle);
    this.statusBar();
  }

  async night(on: boolean, settle = 2000) {
    this.shell('cmd', 'uimode', 'night', on ? 'yes' : 'no');
    this.theme = on ? 'dark' : 'light';
    await sleep(settle);
  }

  async rotate(landscape: boolean, settle = 4000) {
    this.setting('system', 'accelerometer_rotation', '0');
    this.setting('system', 'user_rotation', landscape ? '1' : '0');
    await sleep(settle);
  }

  /** The emulator's clock at today's hh:mm, matching the status bar; the host's time comes back on restore. */
  setClock(hhmm = '09:41') {
    const [hour, minute] = hhmm.split(':').map(Number);
    const moment = new Date();
    moment.setHours(hour, minute, 0, 0);
    this.clockSet = true;
    this.setting('global', 'auto_time', '0');
    this.shell('cmd', 'alarm', 'set-time', moment.getTime());
  }

  /** The app's own language (Android 13+), checked; empty resets it to the system language. */
  appLocale(pkg: string, locale: string) {
    this.shell('cmd', 'locale', 'set-app-locales', pkg, '--user', 'current', '--locales', locale);
    const read = this.shell('cmd', 'locale', 'get-app-locales', pkg, '--user', 'current');
    if (read.match(/are \[([^\]]*)\]/)?.[1] !== locale) throw new Error(`The app's language did not switch to ${locale || 'the system language'}: ${read.trim()}`);
  }

  /** The display as PNG. Some emulators print a warning (several displays) first: the image starts at its signature. */
  screenshot(): Buffer {
    const run = spawnSync('adb', ['-s', this.serial, 'exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024});
    const raw = run.stdout as Buffer;
    const start = raw.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (run.status !== 0 || start < 0) throw new Error(`${this.serial} sent no screenshot: ${String(run.stderr || raw.subarray(0, 200))}`);
    return raw.subarray(start);
  }

  /** Install an APK. Low storage: reinstall from scratch, then trim caches; another machine's debug key: reinstall. */
  install(apk: string, pkg: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let out: string;
      try { out = this.adb('install', '-r', '-t', apk); } catch (error) { out = (error as Error).message; }
      if (out.includes('Success')) return;
      if (/INSUFFICIENT_STORAGE/.test(out) && attempt === 0) this.try('pm', 'uninstall', pkg) || this.adbTry('uninstall', pkg);
      else if (/INSUFFICIENT_STORAGE/.test(out) && attempt === 1) this.try('pm', 'trim-caches', '64G');
      else if (/UPDATE_INCOMPATIBLE/.test(out) && attempt === 0) this.adbTry('uninstall', pkg);
      else throw new Error(`Installing ${apk} failed: ${out.trim()}`);
    }
    throw new Error(`Installing ${apk} failed after three tries.`);
  }

  private adbTry(...words: string[]) { try { return this.adb(...words); } catch { return ''; } }

  /** Undo what an interrupted run can leave behind: display overrides, demo mode, dark mode, no animations, no network. */
  reset() {
    this.demo('exit');
    for (const words of [['wm', 'size', 'reset'], ['wm', 'density', 'reset'], ['cmd', 'uimode', 'night', 'no'], ['svc', 'wifi', 'enable'], ['svc', 'data', 'enable']]) this.try(...words);
    for (const key of SCALES) this.setting('global', key, '1');
    this.setting('global', 'heads_up_notifications_enabled', '1');
    this.setting('global', 'auto_time', '1');
    this.setting('system', 'accelerometer_rotation', '1');
  }

  /** Put everything back, even after a failure; returns what could not be. */
  restore(options: {pkg?: string; appLocale?: boolean; offline?: boolean; uninstall?: boolean}): string[] {
    const failed: string[] = [];
    const step = (name: string, run: () => unknown) => { try { run(); } catch (error) { failed.push(`${name}: ${(error as Error).message}`); } };
    if (options.pkg) step('stop the app', () => this.shell('am', 'force-stop', options.pkg!));
    if (options.pkg && options.appLocale) step('app language', () => this.appLocale(options.pkg!, ''));
    step('demo mode', () => this.demo('exit'));
    step('night mode', () => this.shell('cmd', 'uimode', 'night', 'no'));
    step('display size', () => this.shell('wm', 'size', 'reset'));
    step('display density', () => this.shell('wm', 'density', 'reset'));
    if (this.clockSet) step('clock', () => this.shell('cmd', 'alarm', 'set-time', Date.now()));
    const defaults: Record<string, string> = {heads_up_notifications_enabled: '1', auto_time: '1', font_scale: '1.0', accelerometer_rotation: '1', user_rotation: '0',
      ...Object.fromEntries(SCALES.map(key => [key, '1']))};
    for (const [where, value] of this.saved) {
      const [namespace, key] = where.split('/') as ['global' | 'system', string];
      step(key, () => this.setting(namespace, key, value || defaults[key]));
    }
    if (options.offline) { step('Wi-Fi', () => this.shell('svc', 'wifi', 'enable')); step('mobile data', () => this.shell('svc', 'data', 'enable')); }
    if (options.uninstall && options.pkg) step('uninstall', () => this.adb('uninstall', options.pkg!));
    return failed;
  }
}
