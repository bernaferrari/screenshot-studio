// Picking a card's callout on its reference capture, apart from the DOM.
import type { Callout, Card, Galleries, UiNode, UiTree } from "./types";
import type { Size } from "./viewer";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const targetKeys = ["target", "targetMode", "targetId", "targetClass"] as const;

export const nodeName = (node: UiNode): string =>
  node.desc ||
  node.text ||
  node.id?.split("/").at(-1) ||
  node.cls?.split(".").at(-1) ||
  "Container";

/** Worth picking on its own: it has words or an ID, or it's a control. */
export const meaningful = (node: UiNode): boolean =>
  !!(
    node.text ||
    node.desc ||
    node.id ||
    /button|checkbox|edittext|switch|radio|slider/i.test(node.cls || "")
  );

export const nodeBox = (node: UiNode): Box => ({
  x: node.b[0],
  y: node.b[1],
  w: node.b[2] - node.b[0],
  h: node.b[3] - node.b[1],
});

const area = (node: UiNode) =>
  (node.b[2] - node.b[0]) * (node.b[3] - node.b[1]);

/** The layout map's elements with usable bounds inside the capture. */
export const usableNodes = (tree: UiTree, size: Size): UiNode[] =>
  (tree.nodes || []).filter(
    (n) =>
      typeof n.path === "string" &&
      Array.isArray(n.b) &&
      n.b.length === 4 &&
      n.b.every(Number.isFinite) &&
      n.b[0] >= 0 &&
      n.b[1] >= 0 &&
      n.b[2] > n.b[0] &&
      n.b[3] > n.b[1] &&
      n.b[2] <= size.width &&
      n.b[3] <= size.height,
  );

/** The element a saved callout points at, if it's still there: by a unique resource ID, else by path, and of the same class. */
export function savedNode(
  saved: Partial<Callout>,
  nodes: UiNode[],
): UiNode | undefined {
  const byId = saved.targetId
      ? nodes.filter((n) => n.id === saved.targetId)
      : null,
    candidate = byId
      ? byId.length === 1
        ? byId[0]
        : undefined
      : nodes.find((n) => n.path === saved.target);
  return candidate &&
    (!saved.targetClass || candidate.cls === saved.targetClass)
    ? candidate
    : undefined;
}

/** The smallest pickable element under a point of the capture. */
export const nodeAt = (
  nodes: UiNode[],
  x: number,
  y: number,
  containers: boolean,
): UiNode | undefined =>
  nodes
    .filter(
      (n) =>
        (containers || meaningful(n)) &&
        n.b[0] <= x &&
        x <= n.b[2] &&
        n.b[1] <= y &&
        y <= n.b[3],
    )
    .sort((a, b) => area(a) - area(b))[0];

/** Elements matching a search of their text, label, ID, class or path; the selected one always stays. */
export const findNodes = (
  nodes: UiNode[],
  query: string,
  containers: boolean,
  selected: UiNode | null,
): UiNode[] =>
  nodes.filter(
    (n) =>
      n.path === selected?.path ||
      ((containers || meaningful(n)) &&
        [n.text, n.desc, n.id, n.cls, n.path].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )),
  );

export const parentNode = (nodes: UiNode[], node: UiNode): UiNode | undefined =>
  nodes.find((n) => n.path === node.path.split(".").slice(0, -1).join("."));

/** The box between two corners. */
export const boxBetween = (
  [x1, y1]: [number, number],
  [x2, y2]: [number, number],
): Box => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  w: Math.abs(x1 - x2),
  h: Math.abs(y1 - y2),
});

/** A pointer's position in capture pixels, from where the capture shows on screen; kept inside the capture. */
export const capturePoint = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  size: Size,
): [number, number] => [
  Math.max(
    0,
    Math.min(size.width, ((clientX - rect.left) * size.width) / rect.width),
  ),
  Math.max(
    0,
    Math.min(size.height, ((clientY - rect.top) * size.height) / rect.height),
  ),
];

/** A box as percentages of the capture, to draw over its image. */
export const boxStyle = (box: Box, size: Size) => ({
  left: `${(box.x / size.width) * 100}%`,
  top: `${(box.y / size.height) * 100}%`,
  width: `${(box.w / size.width) * 100}%`,
  height: `${(box.h / size.height) * 100}%`,
});

/** The card's saved callout for a device (device 0 is left out, as the file writes it). */
export function savedCallout(card: Card, device: number): Partial<Callout> {
  const saved: Partial<Callout> = {
    ...(card.callouts || []).find((c) => (c.device || 0) === device),
  };
  if (!device) delete saved.device;
  return saved;
}

export interface Pick {
  mode: "box" | "element";
  box: Box | null;
  /** The box was drawn or typed by hand: drop the saved element target. */
  manual: boolean;
  /** Chose to draw at some point, so the saved element isn't selected when the layout map arrives. */
  drawn: boolean;
  selected: UiNode | null;
  hovered: UiNode | null;
  /** The saved callout's element is gone from this capture. */
  missing: boolean;
  mag: string;
  radius: string;
}

export type PickEvent =
  | { type: "reset"; saved: Partial<Callout> }
  | { type: "restore"; box: Box }
  | { type: "select"; node: UiNode }
  /** Pick elements; `missing` when the saved one isn't there. */
  | { type: "elements"; missing?: boolean }
  | { type: "draw" }
  | { type: "box"; box: Box }
  | { type: "edit"; key: keyof Box; value: number }
  | { type: "hover"; node: UiNode | null }
  | { type: "set"; field: "mag" | "radius"; value: string };

export const startPick = (saved: Partial<Callout>): Pick => ({
  mode: "box",
  box: null,
  manual: false,
  drawn: false,
  selected: null,
  hovered: null,
  missing: false,
  mag: String(saved.mag || 1.12),
  radius: String(saved.radius ?? 24),
});

export function pickReducer(pick: Pick, event: PickEvent): Pick {
  switch (event.type) {
    case "reset":
      return startPick(event.saved);
    case "restore":
      return { ...pick, box: event.box };
    case "select":
      return {
        ...pick,
        selected: event.node,
        hovered: null,
        mode: "element",
        manual: false,
        box: nodeBox(event.node),
      };
    case "elements":
      return {
        ...pick,
        mode: "element",
        missing: event.missing ?? pick.missing,
      };
    case "draw":
      return {
        ...pick,
        mode: "box",
        manual: true,
        drawn: true,
        selected: null,
        hovered: null,
      };
    case "box":
      return { ...pick, box: event.box };
    case "edit":
      return {
        ...pickReducer(pick, { type: "draw" }),
        box: { x: 0, y: 0, w: 0, h: 0, ...pick.box, [event.key]: event.value },
      };
    case "hover":
      return pick.hovered === event.node
        ? pick
        : { ...pick, hovered: event.node };
    case "set":
      return { ...pick, [event.field]: event.value };
  }
}

/** The callout the pick describes, built on the saved one so its other settings survive. */
export function pickedCallout(
  pick: Pick,
  saved: Partial<Callout>,
  nodes: UiNode[],
  device: number,
): Callout | null {
  const { box, selected } = pick;
  if (!box) return null;
  const next: Partial<Callout> = { ...saved };
  if (pick.manual) for (const key of targetKeys) delete next[key];
  if (selected && pick.mode === "element") {
    for (const key of targetKeys) delete next[key];
    Object.assign(next, {
      target: selected.path,
      targetMode: "element",
      ...(selected.cls ? { targetClass: selected.cls } : {}),
      ...(selected.id && nodes.filter((n) => n.id === selected.id).length === 1
        ? { targetId: selected.id }
        : {}),
    });
  }
  Object.assign(next, {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
    mag: Number(pick.mag),
    radius: Number(pick.radius),
  });
  if (device) next.device = device;
  else delete next.device;
  return next as Callout;
}

/** Inside the capture, magnified 1–3×, and an element callout has its element. */
export const validCallout = (
  value: Callout,
  size: Size,
  selected: UiNode | null,
): boolean =>
  [value.x, value.y, value.w, value.h, value.mag, value.radius].every(
    Number.isFinite,
  ) &&
  value.x >= 0 &&
  value.y >= 0 &&
  value.w >= 1 &&
  value.h >= 1 &&
  value.x + value.w <= size.width &&
  value.y + value.h <= size.height &&
  value.mag! >= 1 &&
  value.mag! <= 3 &&
  value.radius! >= 0 &&
  (value.targetMode !== "element" || !!selected);

/** Set (or with null, clear) a card's callout for a device in gallery.json, in place. */
export function placeCallout(
  gallery: Galleries,
  kind: string,
  index: number,
  callout: Callout | null,
  device: number,
  fallback: Callout[] = [],
): void {
  const list = gallery[kind],
    target = Array.isArray(list) ? list[index] : (list.cards[index] as Card);
  if (!callout) {
    if (Array.isArray(list)) delete target.callouts;
    else target.callouts = [];
    return;
  }
  const existing = target.callouts || fallback;
  const position = existing.findIndex((c) => (c.device || 0) === device);
  target.callouts = existing.map((c, i) => (i === position ? callout : c));
  if (position < 0) target.callouts.push(callout);
}
