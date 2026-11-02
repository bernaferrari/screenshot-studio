// What is on the capture emulator's screen, through agent-device: the UI tree with positions, the element a label
// names, taps, and the layout map written beside each capture (so callouts follow their element in every language).
import type {AgentDeviceClient, SnapshotNode} from 'agent-device';

/** One UI element, in the studio's layout-map shape: a tree path stable between languages, bounds in pixels. */
export interface TreeNode {path: string; b: [number, number, number, number]; text?: string; desc?: string; id?: string; cls?: string}

/** Classes whose label is their text; any other labelled element is described (an icon button, a toggle). */
const TEXT_CLASS = /(TextView|Button|EditText|CheckBox|RadioButton|Switch|Chip)$/;

let client: Promise<AgentDeviceClient> | null = null;
/** One agent-device client for the run, in a session of its own. */
export function agentDevice(): Promise<AgentDeviceClient> {
  return client ||= import('agent-device').then(({createAgentDeviceClient}) => createAgentDeviceClient({session: 'screenshot-studio'}));
}

/** The app's UI tree, without the system bars, each element with its path among its siblings. */
export async function readTree(serial: string): Promise<{width: number; height: number; nodes: TreeNode[]}> {
  const device = await agentDevice();
  const snapshot = await device.capture.snapshot({platform: 'android', serial, raw: true});
  // What is on screen, as uiautomator lists it: no system bars, nothing the user can't see or that lies off the display.
  const {width = Infinity, height = Infinity} = snapshot.viewport || {};
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
      nodes.push({path: here, b: [Math.round(x), Math.round(y), Math.round(x + width), Math.round(y + height)],
        ...(text && {text}), ...(desc && {desc}), ...(node.identifier && {id: node.identifier}), ...(node.type && {cls: node.type})});
    }
    visit(node.index, here);
  });
  visit(undefined, '');
  return {width: snapshot.viewport?.width || 0, height: snapshot.viewport?.height || 0, nodes};
}

/** Whether an element matches a label: its whole text, or its description unless textOnly. A string is a regular expression. */
export function matcher(label: string | RegExp, textOnly = false, within?: (b: TreeNode['b']) => boolean) {
  const pattern = typeof label === 'string' ? new RegExp(`^(?:${label})$`) : new RegExp(`^(?:${label.source})$`, label.flags);
  return (node: TreeNode) => (!within || within(node.b)) && (pattern.test(node.text || '') || (!textOnly && pattern.test(node.desc || '')));
}

/** Tap the middle of an element's bounds. */
export async function tapNode(serial: string, node: TreeNode) {
  const [l, t, r, b] = node.b;
  const device = await agentDevice();
  await device.interactions.press({platform: 'android', serial, x: Math.round((l + r) / 2), y: Math.round((t + b) / 2)});
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

  json(): string {
    return JSON.stringify(Object.fromEntries(Object.entries(this.paths).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n';
  }
}
