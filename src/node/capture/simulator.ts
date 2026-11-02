// An iOS simulator's state, set for a capture and put back afterwards: the status bar (9:41, full battery, Wi-Fi and
// signal, no carrier), light or dark appearance, the default text size, and the app's language for each launch.
// Xcode's `xcrun simctl`; agent-device reads and drives the app (screen.ts).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {findSimulator} from '../ios';
import {sleep} from './emulator';

/** Store locales whose iOS language differs from the plain tag. */
const LANGUAGES: Record<string, string> = {'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-HK', 'iw-IL': 'he', 'in-ID': 'id'};

/** A store locale (de-DE) as iOS launch arguments: -AppleLanguages (de-DE) -AppleLocale de_DE. */
export function appleLanguage(locale: string): string[] {
  const parts = locale.split('-'), region = parts.slice(1).find(part => /^([A-Z]{2}|\d{3})$/.test(part));
  return ['-AppleLanguages', `(${LANGUAGES[locale] || locale})`, '-AppleLocale', region ? `${parts[0]}_${region}` : parts[0]];
}

/**
 * 9:41 on 9 January 2007, local time (an iPad shows the date too). simctl reads the ISO time as UTC and shows it in
 * the simulator's time zone, which is the Mac's.
 */
const NINE_FORTY_ONE = new Date(2007, 0, 9, 9, 41).toISOString();

export class Simulator {
  theme: 'light' | 'dark' = 'light';
  battery = 100;
  private saved: {appearance: string; contentSize: string} | null = null;

  constructor(readonly udid: string, readonly name: string, readonly bootedHere = false) {}

  /** The simulator a name or UDID means, booted (headless) if it isn't running. */
  static open(name: string): Simulator {
    const device = findSimulator(name);
    if (device.state === 'Booted') return new Simulator(device.udid, device.name);
    const run = spawnSync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {encoding: 'utf8', timeout: 10 * 60_000});
    if (run.status !== 0) throw new Error(`${device.name} did not boot: ${(run.stderr || run.stdout || '').trim()}`);
    return new Simulator(device.udid, device.name, true);
  }

  simctl(...words: (string | number)[]): string {
    const run = spawnSync('xcrun', ['simctl', ...words.map(String)], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300_000});
    if (run.error) throw new Error('xcrun not found: iOS capture needs Xcode with a simulator runtime.');
    if (run.status !== 0) throw new Error(`simctl ${words.join(' ')} failed: ${(run.stderr || run.stdout || '').trim()}`);
    return run.stdout;
  }

  /** A simctl command that may fail without stopping the capture. */
  try(...words: (string | number)[]): string { try { return this.simctl(...words); } catch { return ''; } }

  /** Prepare for a capture: the current appearance and text size remembered, the default text size, the status bar. */
  prepare() {
    if (!this.saved) this.saved = {appearance: this.try('ui', this.udid, 'appearance').trim(), contentSize: this.try('ui', this.udid, 'content_size').trim()};
    this.try('ui', this.udid, 'content_size', 'large');
    this.statusBar();
  }

  /** 9:41, the battery full (or at `battery`), full Wi-Fi and signal, no carrier name. */
  statusBar() {
    this.simctl('status_bar', this.udid, 'override', '--time', NINE_FORTY_ONE, '--batteryState', this.battery >= 100 ? 'charged' : 'discharging',
      '--batteryLevel', this.battery, '--cellularMode', 'active', '--cellularBars', 4, '--wifiMode', 'active', '--wifiBars', 3, '--dataNetwork', 'wifi', '--operatorName', '');
  }

  async night(on: boolean, settle = 1500) {
    this.simctl('ui', this.udid, 'appearance', on ? 'dark' : 'light');
    this.theme = on ? 'dark' : 'light';
    await sleep(settle);
  }

  /** The display as PNG, square-cornered (the frame rounds it). */
  screenshot(): Buffer {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sim-')), 'screen.png');
    try { this.simctl('io', this.udid, 'screenshot', '--type=png', '--mask=ignored', file); return fs.readFileSync(file); }
    finally { fs.rmSync(path.dirname(file), {recursive: true, force: true}); }
  }

  install(app: string) {
    if (!fs.existsSync(app)) throw new Error(`No .app at ${app}: build it for the simulator first (studio.json capture.build)`);
    this.simctl('install', this.udid, app);
  }

  /** Undo what an interrupted run can leave behind: the status bar, dark mode, a text size. */
  reset() {
    this.try('status_bar', this.udid, 'clear');
    this.try('ui', this.udid, 'appearance', 'light');
    this.try('ui', this.udid, 'content_size', 'large');
  }

  /** Put everything back, even after a failure, and shut the simulator down if this run booted it; returns what could not be. */
  restore({bundle, uninstall = false, keep = false}: {bundle?: string; uninstall?: boolean; keep?: boolean}): string[] {
    const failed: string[] = [];
    const step = (name: string, run: () => unknown) => { try { run(); } catch (error) { failed.push(`${name}: ${(error as Error).message}`); } };
    if (bundle) step('stop the app', () => this.try('terminate', this.udid, bundle));
    if (bundle && uninstall) step('uninstall', () => this.simctl('uninstall', this.udid, bundle));
    step('status bar', () => this.simctl('status_bar', this.udid, 'clear'));
    if (this.saved && /^(light|dark)$/.test(this.saved.appearance)) step('appearance', () => this.simctl('ui', this.udid, 'appearance', this.saved!.appearance));
    if (this.saved?.contentSize && !/unknown|unsupported/.test(this.saved.contentSize)) step('text size', () => this.simctl('ui', this.udid, 'content_size', this.saved!.contentSize));
    if (this.bootedHere && !keep) step('shut down', () => this.simctl('shutdown', this.udid));
    return failed;
  }
}
