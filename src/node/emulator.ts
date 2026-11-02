/**
 * The capture emulator as an agent sees it, for writing a capture tour: what is on screen (a screenshot and every
 * labelled element with its bounds), read through agent-device exactly as a tour reads it, and a way to move around
 * (tap by label or point, back).
 *   npx screenshot-studio screen [--serial emulator-5578] [--out screen.png] [--json]
 *   npx screenshot-studio screen --tap "Settings" | --tap 540,1200 | --back
 * Emulators only: a phone is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import {DEFAULT_SERIAL, missingEmulator} from './recapture';
import {Emulator, sleep} from './capture/emulator';
import {matcher, readTree, tapNode, type TreeNode} from './capture/screen';

export interface ScreenElement {
  /** What a tour taps it by: its text, else its description, else its ID. */
  label: string;
  text?: string;
  description?: string;
  id?: string;
  class: string;
  /** Left, top, right, bottom, in screen pixels. */
  bounds: [number, number, number, number];
  /** Its place in the UI tree, as layout maps and the tap map record it. */
  path: string;
}

export interface Screen {serial: string; width: number; height: number; png: Buffer; elements: ScreenElement[]; dialog?: string}

/** The serial, checked: attached, booted, and an emulator. */
export function emulator(serial = process.env.CAPTURE_SERIAL || DEFAULT_SERIAL): string {
  const problem = missingEmulator(serial);
  if (problem) throw new Error(problem);
  if (!new Emulator(serial).isEmulator()) throw new Error(`${serial} is not an emulator. The studio only drives emulators, never a phone.`);
  return serial;
}

const element = (node: TreeNode): ScreenElement => ({
  label: node.text || node.desc || node.id!, ...(node.text && {text: node.text}), ...(node.desc && {description: node.desc}),
  ...(node.id && {id: node.id}), class: (node.cls || '').split('.').pop() || '', bounds: node.b, path: node.path,
});

/** A screenshot and every labelled element on screen, top to bottom. */
export async function readScreen(serial = emulator()): Promise<Screen> {
  const tree = await readTree(serial);
  const png = new Emulator(serial).screenshot();
  const elements = tree.nodes.filter(node => node.text || node.desc || node.id).map(element)
    .sort((p, q) => p.bounds[1] - q.bounds[1] || p.bounds[0] - q.bounds[0]);
  return {serial, width: png.readUInt32BE(16), height: png.readUInt32BE(20), png, elements, ...(tree.dialog && {dialog: tree.dialog})};
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

/** Tap an element by its label (whole, then containing, case-insensitive) or a point "x,y"; or press back. */
export async function tapScreen(target: string, serial = emulator()): Promise<string> {
  const emu = new Emulator(serial);
  if (target === 'back') { emu.shell('input', 'keyevent', 'KEYCODE_BACK'); return 'back'; }
  const point = target.match(/^(\d+)\s*,\s*(\d+)$/);
  if (point) { emu.shell('input', 'tap', point[1], point[2]); return `${point[1]},${point[2]}`; }
  const {nodes} = await readTree(serial);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = nodes.find(matcher(new RegExp(escaped, 'i'))) || nodes.find(matcher(new RegExp(`.*${escaped}.*`, 'i'))) || nodes.find(node => node.id === target);
  if (!hit) throw new Error(`Nothing on screen is labelled "${target}". Run \`npx screenshot-studio screen\` to see the labels.`);
  await tapNode(serial, hit);
  return hit.text || hit.desc || hit.id || hit.path;
}

/** `screen [--serial s] [--out file.png] [--json] [--tap label | --tap x,y | --back]` */
export async function run(argv: string[]): Promise<number> {
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const serial = emulator(option('serial'));
    const tap = argv.includes('--back') ? 'back' : option('tap');
    if (tap) {
      console.log(`tapped ${await tapScreen(tap, serial)}`);
      await sleep(1200);
    }
    const screen = await readScreen(serial);
    const out = path.resolve(option('out') || 'screen.png');
    fs.writeFileSync(out, screen.png);
    if (argv.includes('--json')) console.log(JSON.stringify({serial, width: screen.width, height: screen.height, image: out, ...(screen.dialog && {dialog: screen.dialog}), elements: screen.elements}, null, 2));
    else console.log(`${formatScreen(screen)}\nscreenshot: ${path.relative(process.cwd(), out) || out}`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}
