/**
 * The capture emulator as an agent sees it, for writing a capture tour: what is on screen (a screenshot and every
 * element with its label, ID and bounds) and a way to move around (tap by label or point, back).
 *   npx screenshot-studio screen [--serial emulator-5578] [--out screen.png] [--json]
 *   npx screenshot-studio screen --tap "Settings" | --tap 540,1200 | --back
 * Emulators only: a phone is refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseXml, type XmlElement} from './icon/xml';
import {DEFAULT_SERIAL, missingEmulator} from './recapture';

export interface ScreenElement {
  /** What a tour taps it by: its text, else its content description, else its resource ID. */
  label: string;
  text?: string;
  description?: string;
  id?: string;
  class: string;
  clickable: boolean;
  /** Left, top, right, bottom, in screen pixels. */
  bounds: [number, number, number, number];
}

export interface Screen {serial: string; width: number; height: number; png: Buffer; elements: ScreenElement[]}

const adb = (serial: string, args: string[], binary = false) => {
  const run = spawnSync('adb', ['-s', serial, ...args], {encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (run.status !== 0) throw new Error(`adb ${args.join(' ')} failed: ${String(run.stderr).trim()}`);
  return run.stdout;
};

const decode = (text: string) => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

/** The serial, checked: attached, booted, and an emulator. */
export function emulator(serial = process.env.CAPTURE_SERIAL || DEFAULT_SERIAL): string {
  const problem = missingEmulator(serial);
  if (problem) throw new Error(problem);
  const qemu = String(adb(serial, ['shell', 'getprop', 'ro.kernel.qemu'])) + String(adb(serial, ['shell', 'getprop', 'ro.boot.qemu']));
  if (!qemu.includes('1')) throw new Error(`${serial} is not an emulator. The studio only drives emulators, never a phone.`);
  return serial;
}

/** A screenshot and every labelled or tappable element on screen, top to bottom. */
export function readScreen(serial = emulator()): Screen {
  // Some emulators print a warning (several displays) before the image: it starts at the PNG signature.
  const raw = adb(serial, ['exec-out', 'screencap', '-p'], true) as Buffer;
  const start = raw.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (start < 0) throw new Error(`${serial} sent no screenshot: ${raw.subarray(0, 200).toString()}`);
  const png = raw.subarray(start);
  adb(serial, ['shell', 'uiautomator', 'dump', '/sdcard/window.xml']);
  const xml = String(adb(serial, ['exec-out', 'cat', '/sdcard/window.xml']));
  const elements: ScreenElement[] = [];
  const walk = (node: XmlElement) => {
    const a = node.attributes;
    if (node.name === 'node') {
      const text = decode(a.text || '').trim(), description = decode(a['content-desc'] || '').trim();
      // Release builds often obfuscate resource IDs; those name nothing.
      const id = /obfuscated/.test(a['resource-id'] || '') ? '' : a['resource-id'] || '';
      const clickable = a.clickable === 'true' || a['long-clickable'] === 'true';
      const b = (a.bounds || '').match(/\d+/g)?.map(Number);
      if (b?.length === 4 && b[2] > b[0] && b[3] > b[1] && (text || description || (clickable && id)))
        elements.push({label: text || description || id.replace(/^.*:id\//, ''), ...(text && {text}), ...(description && {description}), ...(id && {id}),
          class: (a.class || '').split('.').pop() || '', clickable, bounds: b as ScreenElement['bounds']});
    }
    node.children.forEach(walk);
  };
  walk(parseXml(xml));
  elements.sort((p, q) => p.bounds[1] - q.bounds[1] || p.bounds[0] - q.bounds[0]);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  return {serial, width, height, png, elements};
}

/** The elements as lines an agent can act on: tappable ones with the tour call that taps them. */
export function formatScreen(screen: Screen): string {
  const lines = screen.elements.map(e => {
    const [l, t, r, b] = e.bounds;
    const extra = [e.text && e.description && e.description !== e.text ? `desc "${e.description}"` : '', e.id ? `id ${e.id.replace(/^.*:id\//, '')}` : ''].filter(Boolean).join(', ');
    return `${e.clickable ? 'tap ' : '    '} "${e.label.replace(/\n/g, ' ')}"  ${e.class} at ${l},${t} ${r - l}×${b - t}${extra ? `  (${extra})` : ''}`;
  });
  return [`${screen.serial}, ${screen.width}×${screen.height}. "tap" lines are tappable: in a tour, d.tap("label"); here, screen --tap "label".`, ...lines].join('\n');
}

/** Tap an element by its label (exact, then containing) or a point "x,y"; or press back. Returns the element tapped. */
export function tapScreen(target: string, serial = emulator()): string {
  if (target === 'back') { adb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_BACK']); return 'back'; }
  const point = target.match(/^(\d+)\s*,\s*(\d+)$/);
  if (point) { adb(serial, ['shell', 'input', 'tap', point[1], point[2]]); return `${point[1]},${point[2]}`; }
  const {elements} = readScreen(serial);
  const wanted = target.toLowerCase();
  const matches = [
    ...elements.filter(e => [e.text, e.description, e.id?.replace(/^.*:id\//, '')].some(v => v?.toLowerCase() === wanted)),
    ...elements.filter(e => e.label.toLowerCase().includes(wanted)),
  ];
  const hit = matches.find(e => e.clickable) || matches[0];
  if (!hit) throw new Error(`Nothing on screen is labelled "${target}". Run \`npx screenshot-studio screen\` to see the labels.`);
  const [l, t, r, b] = hit.bounds;
  adb(serial, ['shell', 'input', 'tap', String(Math.round((l + r) / 2)), String(Math.round((t + b) / 2))]);
  return hit.label;
}

/** `screen [--serial s] [--out file.png] [--json] [--tap label | --tap x,y | --back]` */
export async function run(argv: string[]): Promise<number> {
  const option = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const serial = emulator(option('serial'));
    const tap = argv.includes('--back') ? 'back' : option('tap');
    if (tap) {
      console.log(`tapped ${tapScreen(tap, serial)}`);
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    const screen = readScreen(serial);
    const out = path.resolve(option('out') || 'screen.png');
    fs.writeFileSync(out, screen.png);
    if (argv.includes('--json')) console.log(JSON.stringify({serial, width: screen.width, height: screen.height, image: out, elements: screen.elements}, null, 2));
    else console.log(`${formatScreen(screen)}\nscreenshot: ${path.relative(process.cwd(), out) || out}`);
    return 0;
  } catch (error) { console.error((error as Error).message); return 1; }
}
