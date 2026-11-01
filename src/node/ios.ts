/**
 * iOS: the App Store galleries, and the simulators that capture them (Xcode's `xcrun simctl`).
 * The capture itself is Python (capture/ios.py, copied into every app's studio/), like Android's capture.py.
 */
import {spawnSync} from 'node:child_process';
import type {Profile, Profiles} from '../core/types';

/**
 * App Store Connect screenshot sizes, from
 * https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
 * (checked November 2026). Required: iPhone with Dynamic Island, medium display (6.3″: 1206 × 2622 or 1179 × 2556)
 * and, for apps that run on iPad, iPad 13″ (2064 × 2752 or 2048 × 2732). The large display (6.9″: 1320 × 2868,
 * 1290 × 2796 or 1260 × 2736) is the one smaller sizes scale down from; 6.5″ (1284 × 2778 or 1242 × 2688) is only
 * required when no 6.9″ set is given, so the studio makes 6.9″, 6.3″ and 13″.
 */
export const APP_STORE = {
  iphone: {width: 1320, height: 2868, frame: 'iphone', platform: 'ios', label: 'iPhone 6.9″'},
  iphone63: {width: 1206, height: 2622, frame: 'iphone', platform: 'ios', label: 'iPhone 6.3″'},
  ipad: {width: 2064, height: 2752, frame: 'tablet', platform: 'ios', label: 'iPad 13″'},
  'ipad-landscape': {width: 2752, height: 2064, frame: 'tablet', platform: 'ios', label: 'iPad 13″ landscape'},
} as const satisfies Record<string, Profile>;

/** Which App Store gallery an image belongs to, by its shape. */
export function iosGalleryFor(width: number, height: number): {kind: string; profile: Profile} | null {
  const ratio = height / width;
  if (ratio >= 1.75) return {kind: 'iphone', profile: {...APP_STORE.iphone}};
  if (ratio >= 1.15) return {kind: 'ipad', profile: {...APP_STORE.ipad}};
  if (ratio <= 1 / 1.15) return {kind: 'ipad-landscape', profile: {...APP_STORE['ipad-landscape']}};
  return null;
}

export interface SimulatorDevice {name: string; udid: string; state: string; runtime: string; version: number[]}

/** Every available simulator, newest runtime first; empty without Xcode. */
export function simulators(): SimulatorDevice[] {
  const run = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {encoding: 'utf8'});
  if (run.status !== 0 || !run.stdout) return [];
  const found: SimulatorDevice[] = [];
  for (const [runtime, entries] of Object.entries(JSON.parse(run.stdout).devices as Record<string, SimulatorDevice[]>)) {
    const version = (runtime.split('.').pop()!.match(/\d+/g) || []).map(Number);
    for (const entry of entries) found.push({...entry, runtime, version});
  }
  const newer = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0); return 0; };
  return found.sort((a, b) => newer(a.version, b.version));
}

/** The simulators `init` writes into profiles.json: the newest Pro Max iPhone (6.9″) and 13-inch iPad Pro. */
export function defaultSimulators(available = simulators()): {iphone: string; ipad: string} {
  const pick = (pattern: RegExp, fallback: string) => available.find(d => pattern.test(d.name))?.name || fallback;
  return {iphone: pick(/^iPhone \d+ Pro Max$/, 'iPhone 17 Pro Max'), ipad: pick(/^iPad Pro 13-inch/, 'iPad Pro 13-inch (M5)')};
}

/** The simulator a name or UDID means: a booted one first, then the newest runtime. */
export function findSimulator(name: string, available = simulators()): SimulatorDevice {
  if (!available.length) throw new Error('No iOS simulators found. Install Xcode and a simulator runtime (Xcode → Settings → Components).');
  const matches = available.filter(d => d.udid.toLowerCase() === name.toLowerCase()).concat(available.filter(d => d.name === name));
  if (!matches.length) throw new Error(`No available simulator named "${name}". Available: ${[...new Set(available.map(d => d.name))].join(', ')}`);
  return matches.find(d => d.state === 'Booted') || matches[0];
}

/** Boot a simulator (headless) and wait until it has finished booting. */
export async function bootSimulator(name: string, log: (line: string) => void): Promise<string> {
  const device = findSimulator(name);
  if (device.state === 'Booted') return device.udid;
  log(`Booting ${device.name} (${device.runtime.split('.').pop()}, ${device.udid})…`);
  const run = spawnSync('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {encoding: 'utf8', timeout: 10 * 60_000});
  if (run.status !== 0) throw new Error(`${device.name} did not boot: ${(run.stderr || run.stdout || '').trim()}`);
  log(`${device.name} is ready.`);
  return device.udid;
}

/** The simulator each iOS capture profile runs on: its own "simulator", else the default. */
export function simulatorsFor(profiles: Profiles, names: string[], fallback?: string): string[] {
  const missing = names.filter(name => !profiles[name]?.simulator && !fallback);
  if (missing.length) throw new Error(`No simulator for ${missing.join(', ')}: set "simulator" on the profile in profiles.json, or "capture": {"simulator": "…"} in studio.json`);
  return [...new Set(names.map(name => profiles[name].simulator || fallback!))];
}
