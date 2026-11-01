import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowUp,
  Copy,
  Loader2,
  MousePointer2,
  Save,
  Scan,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Choice, ErrorNotice, Status } from "./common";
import { asset, errorMessage, isAbort, request } from "@/lib/api";
import { copyText, pretty } from "@/lib/format";
import {
  devicesFor,
  nodesFile,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Callout, Card, Galleries, UiNode, UiTree } from "@/lib/types";

export interface PickerSelection {
  card: Card;
  kind: string;
  index: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const targetKeys = ["target", "targetMode", "targetId", "targetClass"] as const;
const nodeName = (node: UiNode) =>
  node.desc ||
  node.text ||
  node.id?.split("/").at(-1) ||
  node.cls?.split(".").at(-1) ||
  "Container";
const meaningful = (node: UiNode) =>
  !!(
    node.text ||
    node.desc ||
    node.id ||
    /button|checkbox|edittext|switch|radio|slider/i.test(node.cls || "")
  );
const nodeBox = (node: UiNode): Box => ({
  x: node.b[0],
  y: node.b[1],
  w: node.b[2] - node.b[0],
  h: node.b[3] - node.b[1],
});

/** Pick a card's callout on its reference capture: an element from the layout map, or a box drawn by hand. */
export function CalloutPicker({
  selection,
  onClose,
  session,
  model,
}: {
  selection: PickerSelection | null;
  onClose(): void;
  session: ProjectSession;
  model: ProjectModel;
}) {
  if (!selection) return null;
  return (
    <Picker
      key={`${selection.kind}-${selection.index}`}
      {...{ selection, onClose, session, model }}
    />
  );
}

function Picker({
  selection,
  onClose,
  session,
  model,
}: {
  selection: PickerSelection;
  onClose(): void;
  session: ProjectSession;
  model: ProjectModel;
}) {
  const { card, kind, index } = selection,
    devices = devicesFor(card),
    [device, setDevice] = useState(card.callouts?.[0]?.device || 0),
    [box, setBox] = useState<Box | null>(null),
    [mode, setMode] = useState<"box" | "element">("box"),
    [manual, setManual] = useState(false),
    [mag, setMag] = useState("1.12"),
    [radius, setRadius] = useState("24"),
    [nodes, setNodes] = useState<UiNode[]>([]),
    [selected, setSelected] = useState<UiNode | null>(null),
    [hovered, setHovered] = useState<UiNode | null>(null),
    [query, setQuery] = useState(""),
    [containers, setContainers] = useState(false),
    [error, setError] = useState(""),
    [treeMessage, setTreeMessage] = useState("Loading capture elements…"),
    [size, setSize] = useState<{ width: number; height: number } | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [image, setImage] = useState<HTMLImageElement | null>(null),
    start = useRef<[number, number] | null>(null),
    original = useRef<Partial<Callout>>({}),
    manualIntent = useRef(false);
  const raw = devices[device]?.raw,
    url = asset(model.base, `../${model.reference}/raw/${raw}`);
  const selectNode = (node: UiNode) => {
    setSelected(node);
    setHovered(null);
    setMode("element");
    setManual(false);
    setBox(nodeBox(node));
  };
  useEffect(() => {
    if (!image) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setSize(null);
    setBox(null);
    setNodes([]);
    setSelected(null);
    setHovered(null);
    setManual(false);
    setMode("box");
    setTreeMessage("Loading capture elements…");
    manualIntent.current = false;
    original.current = {
      ...(card.callouts || []).find((c) => (c.device || 0) === device),
    };
    if (!device) delete original.current.device;
    setMag(String(original.current.mag || 1.12));
    setRadius(String(original.current.radius ?? 24));
    (async () => {
      try {
        await image.decode();
        if (abort.signal.aborted) return;
        const width = image.naturalWidth,
          height = image.naturalHeight,
          old = original.current;
        setSize({ width, height });
        if (old.w && old.h)
          setBox({ x: old.x || 0, y: old.y || 0, w: old.w, h: old.h });
        let tree: UiTree | null;
        try {
          tree = await request<UiTree>(
            asset(model.base, `../${model.reference}/raw/${nodesFile(raw)}`),
            { optional: true, signal: abort.signal },
          );
        } catch (e) {
          if (!isAbort(e))
            setTreeMessage(
              "The layout map could not load. Draw a box, or recapture to add element selection.",
            );
          return;
        }
        if (abort.signal.aborted) return;
        if (!tree)
          return setTreeMessage(
            "No layout map for this capture. Draw a box, or recapture to add element selection.",
          );
        if (tree.width !== width || tree.height !== height)
          return setTreeMessage(
            "The layout map and capture sizes differ. Recapture before using element selection.",
          );
        const valid = (tree.nodes || []).filter(
          (n) =>
            typeof n.path === "string" &&
            Array.isArray(n.b) &&
            n.b.length === 4 &&
            n.b.every(Number.isFinite) &&
            n.b[0] >= 0 &&
            n.b[1] >= 0 &&
            n.b[2] > n.b[0] &&
            n.b[3] > n.b[1] &&
            n.b[2] <= width &&
            n.b[3] <= height,
        );
        setNodes(valid);
        setTreeMessage(
          valid.length
            ? "Exact bounds from this capture. Select a parent to include the whole control."
            : "This capture has no visible elements. Draw a box instead.",
        );
        if (!manualIntent.current && valid.length) {
          setMode("element");
          const byId = old.targetId
              ? valid.filter((n) => n.id === old.targetId)
              : null,
            candidate = byId
              ? byId.length === 1
                ? byId[0]
                : undefined
              : valid.find((n) => n.path === old.target);
          if (
            candidate &&
            (!old.targetClass || candidate.cls === old.targetClass)
          )
            selectNode(candidate);
          else if (old.targetMode === "element")
            setTreeMessage(
              "The saved element is missing or incompatible. Select it again or draw a box.",
            );
        }
      } catch {
        if (!abort.signal.aborted)
          setError(
            "The reference capture could not load. Capture the reference language first, then reopen the picker.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
    // The picker restarts for another capture or device; the card itself is fixed for its lifetime.
  }, [raw, url, device, image]);

  const value: Callout | null = (() => {
    if (!box) return null;
    const next: Partial<Callout> = { ...original.current };
    if (manual) for (const key of targetKeys) delete next[key];
    if (selected && mode === "element") {
      for (const key of targetKeys) delete next[key];
      Object.assign(next, {
        target: selected.path,
        targetMode: "element",
        ...(selected.cls ? { targetClass: selected.cls } : {}),
        ...(selected.id &&
        nodes.filter((n) => n.id === selected.id).length === 1
          ? { targetId: selected.id }
          : {}),
      });
    }
    Object.assign(next, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.w),
      h: Math.round(box.h),
      mag: Number(mag),
      radius: Number(radius),
    });
    if (device) next.device = device;
    else delete next.device;
    return next as Callout;
  })();
  const valid =
    !!value &&
    !!size &&
    !loading &&
    !busy &&
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
  const at = (x: number, y: number) =>
    nodes
      .filter(
        (n) =>
          (containers || meaningful(n)) &&
          n.b[0] <= x &&
          x <= n.b[2] &&
          n.b[1] <= y &&
          y <= n.b[3],
      )
      .sort(
        (a, b) =>
          (a.b[2] - a.b[0]) * (a.b[3] - a.b[1]) -
          (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]),
      )[0];
  const point = (e: ReactPointerEvent): [number, number] => {
    const rect = image!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          size!.width,
          ((e.clientX - rect.left) * size!.width) / rect.width,
        ),
      ),
      Math.max(
        0,
        Math.min(
          size!.height,
          ((e.clientY - rect.top) * size!.height) / rect.height,
        ),
      ),
    ];
  };
  const manualMode = () => {
    manualIntent.current = true;
    setMode("box");
    setManual(true);
    setSelected(null);
    setHovered(null);
  };
  const drawStyle = (b: Box) => ({
    left: `${(b.x / size!.width) * 100}%`,
    top: `${(b.y / size!.height) * 100}%`,
    width: `${(b.w / size!.width) * 100}%`,
    height: `${(b.h / size!.height) * 100}%`,
  });
  const filtered = nodes.filter(
    (n) =>
      n.path === selected?.path ||
      ((containers || meaningful(n)) &&
        [n.text, n.desc, n.id, n.cls, n.path].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )),
  );
  const parent =
    selected &&
    nodes.find(
      (n) => n.path === selected.path.split(".").slice(0, -1).join("."),
    );
  const write = async (clear: boolean) => {
    if (busy || (!clear && !valid)) return;
    setBusy(true);
    setError("");
    try {
      // Edit the file as it is now, so callouts saved elsewhere since the editor loaded survive.
      const gallery = await request<Galleries>(
        asset(model.base, "../gallery.json"),
      );
      const list = gallery[kind],
        target = Array.isArray(list)
          ? list[index]
          : (list.cards[index] as Card);
      if (clear) {
        if (Array.isArray(list)) delete target.callouts;
        else target.callouts = [];
      } else {
        const existing = target.callouts || card.callouts || [];
        const position = existing.findIndex((c) => (c.device || 0) === device);
        target.callouts = existing.map((c, i) => (i === position ? value! : c));
        if (position < 0) target.callouts.push(value!);
      }
      await session.saveGallery(gallery);
      toast.success(clear ? "Callouts removed" : "Callout saved");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 sm:max-w-[min(1180px,94vw)]">
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="flex min-w-0 items-center justify-center bg-muted/60 p-5 lg:p-8">
            <div
              className="capture-stage relative inline-block max-w-full touch-none"
              onPointerDown={(e) => {
                if (e.button !== 0 || !size || busy) return;
                e.preventDefault();
                start.current = point(e);
                e.currentTarget.setPointerCapture(e.pointerId);
                if (mode === "box") manualMode();
              }}
              onPointerMove={(e) => {
                if (!size) return;
                const [x, y] = point(e);
                if (mode === "element") setHovered(at(x, y) || null);
                else if (start.current)
                  setBox({
                    x: Math.min(x, start.current[0]),
                    y: Math.min(y, start.current[1]),
                    w: Math.abs(x - start.current[0]),
                    h: Math.abs(y - start.current[1]),
                  });
              }}
              onPointerUp={(e) => {
                if (start.current && mode === "element") {
                  const node = at(...point(e));
                  if (node) selectNode(node);
                }
                start.current = null;
              }}
              onPointerCancel={() => {
                start.current = null;
              }}
              onPointerLeave={() => setHovered(null)}
            >
              <img
                ref={setImage}
                src={url}
                alt="Reference capture"
                draggable={false}
                className="block h-auto max-h-[68dvh] w-auto max-w-full rounded-md border shadow-sm"
              />
              {box && size && (
                <div
                  className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                  style={drawStyle(box)}
                />
              )}
              {hovered &&
                mode === "element" &&
                size &&
                hovered.path !== selected?.path && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-sky-600 bg-sky-500/10"
                    style={drawStyle(nodeBox(hovered))}
                  />
                )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void write(false);
            }}
            className="space-y-4 border-t p-5 lg:border-t-0 lg:border-l"
          >
            <DialogHeader className="pr-5">
              <DialogTitle>Pick a callout</DialogTitle>
              <DialogDescription>
                {pretty(card.feature)} · {model.reference} reference capture.
                Other languages follow the same element.
              </DialogDescription>
            </DialogHeader>
            {devices.length > 1 && (
              <Choice
                label="Device"
                value={String(device)}
                onChange={(v) => setDevice(Number(v))}
                items={devices.map((d, i) => ({
                  value: String(i),
                  label: d.role ? pretty(d.role) : `Device ${i + 1}`,
                }))}
                className="w-full"
              />
            )}
            <Tabs
              value={mode}
              onValueChange={(v) =>
                v === "box" ? manualMode() : setMode("element")
              }
            >
              <TabsList className="w-full">
                <TabsTrigger
                  value="element"
                  disabled={!nodes.length}
                  className="flex-1"
                >
                  <MousePointer2 />
                  Element
                </TabsTrigger>
                <TabsTrigger value="box" className="flex-1">
                  <Scan />
                  Draw box
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p
              className="text-xs leading-relaxed text-muted-foreground"
              role="status"
            >
              {treeMessage}
            </p>
            {mode === "element" && (
              <div className="space-y-3">
                <Command shouldFilter={false} className="rounded-lg border">
                  <CommandInput
                    placeholder="Find text, label, or ID…"
                    aria-label="Find accessibility element"
                    value={query}
                    onValueChange={setQuery}
                  />
                  <CommandList
                    aria-label="Accessibility elements"
                    className="max-h-44"
                  >
                    <CommandEmpty>No matching elements</CommandEmpty>
                    {filtered.map((n) => (
                      <CommandItem
                        key={n.path}
                        value={n.path}
                        onSelect={() => selectNode(n)}
                        className="items-start"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {nodeName(n)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {n.b[2] - n.b[0]} × {n.b[3] - n.b[1]}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} / {nodes.length} elements
                  </span>
                  <Label className="text-xs">
                    <Checkbox
                      checked={containers}
                      onCheckedChange={(checked) =>
                        setContainers(checked === true)
                      }
                    />
                    Containers
                  </Label>
                </div>
                {selected && (
                  <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
                    <p className="font-medium break-words">
                      {nodeName(selected)}
                    </p>
                    <p className="text-muted-foreground">
                      {value?.targetId
                        ? "Pinned by resource ID"
                        : "Pinned by path and class"}{" "}
                      · exact bounds
                    </p>
                    <code className="block break-all text-muted-foreground">
                      {selected.path}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!parent}
                      onClick={() => parent && selectNode(parent)}
                    >
                      <ArrowUp />
                      Parent element
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Status>
              {value
                ? `${value.w} × ${value.h} px`
                : "Select an element or draw a box"}
            </Status>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mag">Magnification</Label>
                <Input
                  id="mag"
                  type="number"
                  min="1"
                  max="3"
                  step="0.01"
                  value={mag}
                  onChange={(e) => setMag(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius">Corner radius</Label>
                <Input
                  id="radius"
                  type="number"
                  min="0"
                  step="1"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  required
                />
              </div>
            </div>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  Precise selection
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["x", "X"],
                      ["y", "Y"],
                      ["w", "Width"],
                      ["h", "Height"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`box-${key}`}>{label}</Label>
                      <Input
                        id={`box-${key}`}
                        type="number"
                        min={key === "w" || key === "h" ? 1 : 0}
                        step="1"
                        value={box?.[key] ?? 0}
                        onChange={(e) => {
                          manualMode();
                          setBox((old) => ({
                            x: 0,
                            y: 0,
                            w: 0,
                            h: 0,
                            ...old,
                            [key]: Number(e.target.value),
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-[10px]">
                  {value ? JSON.stringify(value, null, 2) : "Draw a selection"}
                </pre>
              </CollapsibleContent>
            </Collapsible>
            {error && <ErrorNotice message={error} />}
            <div className="space-y-2 border-t pt-4">
              <Button
                type="submit"
                className="w-full"
                aria-label="Save as this card's callout"
                disabled={!valid}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Save />}
                Save callout
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!valid}
                  onClick={() =>
                    copyText(JSON.stringify(value))
                      .then(() => toast.success("Callout JSON copied"))
                      .catch(() =>
                        setError(
                          "Clipboard access is unavailable. Copy the JSON in Precise selection.",
                        ),
                      )
                  }
                >
                  <Copy />
                  Copy JSON
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy || !card.callouts?.length}
                  onClick={() => void write(true)}
                >
                  <Trash2 />
                  Remove
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
