/**
 * The capture device as an agent sees it, for writing a capture tour: what is on screen (a screenshot and every
 * labelled element with its bounds), read through agent-device exactly as a tour reads it, and a way to move around
 * (tap by label or point, back). An Android emulator, or a booted iOS simulator with --simulator.
 *   npx screenshot-studio screen [--serial emulator-5578 | --simulator "iPhone 17 Pro Max" [--app com.example.app]] [--out screen.png] [--json]
 *   npx screenshot-studio screen --tap "Settings" | --tap 540,1200 | --back
 * On iOS agent-device reads an app's screen: --app (default: the listing's iOS app) is brought to the front first.
 * Emulators and simulators only: a phone is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import {DEFAULT_SERIAL, missingEmulator} from './recapture';
import {Emulator, sleep} from './capture/emulator';
import {goBack, matcher, openApp, readTree, tapNode, tapPoint, type Target, type TreeNode} from './capture/screen';
import {loadListing, findListing} from './project';
import {Simulator} from './capture/simulator';
import {findSimulator} from './ios';

export interface ScreenElement {
  /** What a tour taps it by: its text, else its description, else its ID. */
  label: string;
  text?: string;
  description?: string;
  id?: string;
  class: string;
  /** Left, top, right, bottom, in screenshot pixels. */
  bounds: [number, number, number, number];
  /** Its place in the UI tree, as layout maps and the tap map record it. */
  path: string;
}

/** A device to look at: where agent-device finds it, its screenshot, and on iOS the app whose screen it reads. */
export interface Device {name: string; target: Target; screenshot(): Buffer; app?: string}
export interface Screen {serial: string; width: number; height: number; png: Buffer; elements: ScreenElement[]; dialog?: string}

/** The emulator (checked: attached, booted, an emulator), or with `simulator` a booted iOS simulator. */
export function emulator(serial = process.env.CAPTURE_SERIAL || DEFAULT_SERIAL, simulator?: string, app?: string): Device {
  if (simulator) {
    const found = findSimulator(simulator);
    if (found.state !== 'Booted') throw new Error(`${found.name} isn't booted: open it in Simulator (or xcrun simctl boot "${found.udid}").`);
    const sim = new Simulator(found.udid, found.name);
    const width = sim.screenshot().readUInt32BE(16);
    const listing = findListing();
    const bundle = app || (listing ? loadListing(listing).config.capture?.install?.[0]?.package : undefined);
    if (!bundle) throw new Error('On iOS, name the app whose screen to read: --app com.example.app');
    return {name: found.name, target: {platform: 'ios', udid: found.udid, width}, screenshot: () => sim.screenshot(), app: bundle};
  }
  const problem = missingEmulator(serial);
  if (problem) throw new Error(problem);
  const emu = new Emulator(serial);
  if (!emu.isEmulator()) throw new Error(`${serial} is not an emulator. The studio only drives emulators, never a phone.`);
  return {name: serial, target: {platform: 'android', serial}, screenshot: () => emu.screenshot()};
}

/** iOS: the app in front, in agent-device's session (as it is, not restarted). */
const opened = new Set<string>();
async function front(device: Device) {
  if (!device.app || opened.has(device.name)) return;
  await openApp(device.target, device.app, [], false);
  opened.add(device.name);
}

const element = (node: TreeNode): ScreenElement => ({
  label: node.text || node.desc || node.id!, ...(node.text && {text: node.text}), ...(node.desc && {description: node.desc}),
  ...(node.id && {id: node.id}), class: (node.cls || '').split('.').pop() || '', bounds: node.b, path: node.path,
});

/** A screenshot and every labelled element on screen, top to bottom. */
export async function readScreen(device = emulator()): Promise<Screen> {
  await front(device);
  const tree = await readTree(device.target);
  const png = device.screenshot();
  const elements = tree.nodes.filter(node => node.text || node.desc || node.id).map(element)
    .sort((p, q) => p.bounds[1] - q.bounds[1] || p.bounds[0] - q.bounds[0]);
  return {serial: device.name, width: png.readUInt32BE(16), height: png.readUInt32BE(20), png, elements, ...(tree.dialog && {dialog: tree.dialog})};
}

/** The elements as lines an agent can act on, each with the label a tour taps it by. */
export function formatScreen(screen: Screen): string {
  const lines = screen.elements.map(e => {
    const [l, t, r, b] = e.bounds;
    const extra = [e.text && e.description && e.description !== e.text ? `desc "${e.description}"` : '', e.id && e.id !== e.label ? `id ${e.id}` : ''].filter(Boolean).join(', ');
    return `"${e.label.replace(/\n/g, ' ')}"  ${e.class} at ${l},${t} ${r - l}×${b - t}${extra ? `  (${extra})` : ''}`;
  });
  return [`${screen.serial}, ${screen.width}×${screen.height}. In a tour, d.tap("label") taps one (a regular expression matched whole); here, screen --tap "label".`,
    ...(screen.dialog ? [`A system dialog is on screen: ${screen.dialog}`] : []), ...lines].join('\n');
}

/** Tap an element by its label (whole, then containing, case-insensitive) or a point "x,y" in pixels; or go back. */
export async function tapScreen(target: string, device = emulator()): Promise<string> {
  await front(device);
  if (target === 'back') { await goBack(device.target); return 'back'; }
  const {nodes} = await readTree(device.target);
  const point = target.match(/^(\d+)\s*,\s*(\d+)$/);
  if (point) { await tapPoint(device.target, Number(point[1]), Number(point[2])); return `${point[1]},${point[2]}`; }
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = nodes.find(matcher(new RegExp(escaped, 'i'))) || nodes.find(matcher(new RegExp(`.*${escaped}.*`, 'i'))) || nodes.find(node => node.id === target);
  if (!hit) throw new Error(`Nothing on screen is labelled "${target}". Run \`npx screenshot-studio screen\` to see the labels.`);
  await tapNode(device.target, hit);
  return hit.text || hit.desc || hit.id || hit.path;
}

/** `screen [--serial s | --simulator name] [--out file.png] [--json] [--tap label | --tap x,y | --back]` */
export async function run(argv: string[]): Promise<number> {
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const device = emulator(option('serial'), option('simulator'), option('app'));
    const tap = argv.includes('--back') ? 'back' : option('tap');
    if (tap) {
      console.log(`tapped ${await tapScreen(tap, device)}`);
      await sleep(1200);
    }
    const screen = await readScreen(device);
    const out = path.resolve(option('out') || 'screen.png');
    fs.writeFileSync(out, screen.png);
    if (argv.includes('--json')) console.log(JSON.stringify({device: screen.serial, width: screen.width, height: screen.height, image: out, ...(screen.dialog && {dialog: screen.dialog}), elements: screen.elements}, null, 2));
    else console.log(`${formatScreen(screen)}\nscreenshot: ${path.relative(process.cwd(), out) || out}`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}
