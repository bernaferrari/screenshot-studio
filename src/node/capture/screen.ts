// What is on the capture device's screen (an Android emulator or an iOS simulator), through agent-device: the UI tree
// with positions in screenshot pixels, the element a label names, taps, and the layout map written beside each capture
// (so callouts follow their element in every language).
import type {AgentDeviceClient, SnapshotNode} from 'agent-device';

/** One UI element, in the studio's layout-map shape: a tree path stable between languages, bounds in pixels. */
export interface TreeNode {path: string; b: [number, number, number, number]; text?: string; desc?: string; id?: string; cls?: string}

/** Classes whose label is their text (Android views, iOS elements); any other labelled element is described. */
const TEXT_CLASS = /(TextView|Button|EditText|CheckBox|RadioButton|Switch|Chip|StaticText|TextField|TextView|Link|Cell)$/;

/**
 * The device agent-device reads and drives. `width` is the screen in screenshot pixels: iOS reports positions in
 * points, so they are scaled by width / the screen's width in points.
 */
export type Target = ({platform: 'android'; serial: string} | {platform: 'ios'; udid: string}) & {width?: number};
const selector = (target: Target) => target.platform === 'ios' ? {platform: 'ios' as const, udid: target.udid} : {platform: 'android' as const, serial: target.serial};
/** Pixels per agent-device unit, from the last read of the target. */
const scales = new WeakMap<Target, number>();

const clients = new Map<string, Promise<AgentDeviceClient>>();
/** An agent-device client per device, each in a session of its own (a session belongs to one device). */
export function agentDevice(target: Target): Promise<AgentDeviceClient> {
  const session = `screenshot-studio-${target.platform === 'ios' ? target.udid : target.serial}`;
  if (!clients.has(session)) clients.set(session, import('agent-device').then(({createAgentDeviceClient}) => createAgentDeviceClient({session})));
  return clients.get(session)!;
}

/** The app's UI tree, without the system bars, each element with its path among its siblings. */
export async function readTree(target: Target): Promise<{width: number; height: number; nodes: TreeNode[]; dialog?: string}> {
  const device = await agentDevice(target);
  const snapshot = await device.capture.snapshot({...selector(target), raw: true});
  // iOS has no viewport: the screen is the first element's frame, in points.
  const root = snapshot.nodes.find((node: SnapshotNode) => node.rect && node.parentIndex === undefined)?.rect;
  const {width = root?.width ?? Infinity, height = root?.height ?? Infinity} = snapshot.viewport || {};
  const scale = target.platform === 'ios' && target.width && Number.isFinite(width) ? target.width / width : 1;
  scales.set(target, scale);
  // What is on screen: no system bars, nothing the user can't see or that lies off the display.
  const onScreen = (node: SnapshotNode) => !node.rect || (node.rect.x < width && node.rect.y < height && node.rect.x + node.rect.width > 0 && node.rect.y + node.rect.height > 0);
  const kept = snapshot.nodes.filter((node: SnapshotNode) => !node.systemBar && node.visibleToUser !== false && onScreen(node));
  const keptIndex = new Set(kept.map(node => node.index));
  const children = new Map<number | undefined, SnapshotNode[]>();
  for (const node of kept) {
    const parent = node.parentIndex !== undefined && keptIndex.has(node.parentIndex) ? node.parentIndex : undefined;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(node);
  }
  const nodes: TreeNode[] = [];
  const visit = (parent: number | undefined, path: string) => (children.get(parent) || []).forEach((node, i) => {
    const here = path ? `${path}.${i}` : String(i);
    if (node.rect) {
      const {x, y, width, height} = node.rect;
      const text = node.label && TEXT_CLASS.test(node.type || '') ? node.label : undefined;
      const desc = node.contentDescription || (node.label && !text ? node.label : undefined);
      nodes.push({path: here, b: [Math.round(x * scale), Math.round(y * scale), Math.round((x + width) * scale), Math.round((y + height) * scale)],
        ...(text && {text}), ...(desc && {desc}), ...(node.identifier && {id: node.identifier}), ...(node.type && {cls: node.type})});
    }
    visit(node.index, here);
  });
  visit(undefined, '');
  // A system dialog over the app (an app not responding, one that keeps stopping; on iOS an alert, a permission
  // prompt) would end up in the capture.
  const dialog = snapshot.nodes.find((node: SnapshotNode) => target.platform === 'ios' ? node.type === 'Alert'
    : node.bundleId === 'android' && /isn't responding|keeps stopping|has stopped/.test(node.label || ''))?.label;
  return {width: Number.isFinite(width) ? Math.round(width * scale) : 0, height: Number.isFinite(height) ? Math.round(height * scale) : 0, nodes, ...(dialog && {dialog})};
}

/** Whether an element matches a label: its whole text, or its description unless textOnly. A string is a regular expression. */
export function matcher(label: string | RegExp, textOnly = false, within?: (b: TreeNode['b']) => boolean) {
  const pattern = typeof label === 'string' ? new RegExp(`^(?:${label})$`) : new RegExp(`^(?:${label.source})$`, label.flags);
  return (node: TreeNode) => (!within || within(node.b)) && (pattern.test(node.text || '') || (!textOnly && pattern.test(node.desc || '')));
}

/** Tap the middle of an element's bounds. */
export async function tapNode(target: Target, node: TreeNode) {
  const [l, t, r, b] = node.b;
  await tapPoint(target, (l + r) / 2, (t + b) / 2);
}

/** Tap a point given in screenshot pixels. */
export async function tapPoint(target: Target, x: number, y: number) {
  const scale = scales.get(target) || 1, device = await agentDevice(target);
  await device.interactions.press({...selector(target), x: Math.round(x / scale), y: Math.round(y / scale)});
}

/** Swipe between two points in screenshot pixels. */
export async function swipePoints(target: Target, x1: number, y1: number, x2: number, y2: number, durationMs: number) {
  const scale = scales.get(target) || 1, device = await agentDevice(target);
  // A pan: one finger from the start point, moved over durationMs (a slow pan scrolls without a fling).
  await device.interactions.pan({...selector(target), x: Math.round(x1 / scale), y: Math.round(y1 / scale), dx: Math.round((x2 - x1) / scale), dy: Math.round((y2 - y1) / scale), durationMs});
}

/** Back: Android's back key; on iOS, agent-device's back (the navigation bar's back button, or the edge swipe). */
export async function goBack(target: Target) {
  const device = await agentDevice(target);
  await device.command.back(selector(target));
}

/** iOS: start the app afresh with launch arguments, through agent-device (which reads the screen within that session). */
export async function openApp(target: Target, app: string, launchArgs: string[] = [], relaunch = true) {
  const device = await agentDevice(target);
  await device.apps.open({...selector(target), app, launchArgs, relaunch});
}

/** Type into the focused field. */
export async function typeText(target: Target, text: string) {
  const device = await agentDevice(target);
  await device.interactions.type({...selector(target), text});
}

/**
 * Taps by label are recorded in the default language and replayed by tree path in every other one, where the labels
 * are translated. The map is a JSON file beside the captures; taps with the same key are numbered in order.
 */
export class TapMap {
  private paths: Record<string, string>;
  private seen = new Map<string, number>();
  constructor(file: string, readonly recording: boolean, read: (file: string) => string | null) {
    const text = read(file);
    this.paths = text ? JSON.parse(text) : {};
    if (!recording && !text) throw new Error(`No tap map at ${file}: capture the default language first.`);
  }

  /** The next numbered slot for a key: taps with the same key are numbered in order. */
  private slot(key: string): string {
    const n = this.seen.get(key) || 0;
    this.seen.set(key, n + 1);
    return `${key}#${n}`;
  }

  resolve(key: string, nodes: TreeNode[], matches: (node: TreeNode) => boolean): TreeNode {
    const n = this.seen.get(key) || 0, slot = `${key}#${n}`;
    let node: TreeNode | undefined;
    if (this.recording) {
      node = nodes.find(matches);
      if (!node) throw new Error(`Nothing on screen matches "${key.split('|').pop()}"`);
      this.paths[slot] = node.path;
    } else {
      const path = this.paths[slot];
      if (!path) throw new Error(`No recorded tap for ${slot}: capture this scene in the default language first.`);
      node = nodes.find(candidate => candidate.path === path);
      if (!node) throw new Error(`The recorded tap ${slot} has no element at ${path} here: the screen differs from the default language.`);
    }
    this.seen.set(key, n + 1);
    return node;
  }

  /** Record a value under a key (default language), e.g. how far a scroll went. */
  put(key: string, value: string) { this.paths[this.slot(key)] = value; }

  /** The value recorded under a key, replayed in another language. */
  take(key: string): string {
    const slot = this.slot(key), value = this.paths[slot];
    if (value === undefined) throw new Error(`Nothing recorded for ${slot}: capture this scene in the default language first.`);
    return value;
  }

  json(): string {
    return JSON.stringify(Object.fromEntries(Object.entries(this.paths).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n';
  }
}
