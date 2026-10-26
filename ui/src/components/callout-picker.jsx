import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Save,
  Trash2,
  ArrowUp,
  MousePointer2,
  Scan,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { Choice, ErrorNotice, Status } from "./common";
import { asset, devicesFor, nodesFile, request, pretty } from "@/lib/model";
const targetKeys = ["target", "targetMode", "targetId", "targetClass"];
const name = (node) =>
  node.desc ||
  node.text ||
  node.id?.split("/").at(-1) ||
  node.cls?.split(".").at(-1) ||
  "Container";
const meaningful = (node) =>
  node.text ||
  node.desc ||
  node.id ||
  /button|checkbox|edittext|switch|radio|slider/i.test(node.cls || "");
export function CalloutPicker({ selection, onClose, session }) {
  if (!selection) return null;
  return (
    <Picker
      key={`${selection.kind}-${selection.index}`}
      {...{ selection, onClose, session }}
    />
  );
}
function Picker({ selection, onClose, session }) {
  const { model, saveGallery } = session,
    { card, kind, index } = selection,
    devices = devicesFor(card),
    [device, setDevice] = useState(card.callouts?.[0]?.device || 0),
    [box, setBox] = useState(null),
    [mode, setMode] = useState("box"),
    [manual, setManual] = useState(false),
    [mag, setMag] = useState(1.12),
    [radius, setRadius] = useState(24),
    [nodes, setNodes] = useState([]),
    [selected, setSelected] = useState(null),
    [hovered, setHovered] = useState(null),
    [query, setQuery] = useState(""),
    [containers, setContainers] = useState(false),
    [error, setError] = useState(""),
    [treeMessage, setTreeMessage] = useState("Loading capture elements…"),
    [size, setSize] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [imageNode, setImageNode] = useState(null),
    start = useRef(null),
    original = useRef({}),
    manualIntent = useRef(false);
  const raw = devices[device]?.raw,
    url = asset(model.base, `../${model.reference}/raw/${raw}`);
  const selectNode = (node) => {
    setSelected(node);
    setHovered(null);
    setMode("element");
    setManual(false);
    const [l, t, r, b] = node.b;
    setBox({ x: l, y: t, w: r - l, h: b - t });
  };
  useEffect(() => {
    if (!imageNode) return;
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
    setMag(original.current.mag || 1.12);
    setRadius(original.current.radius ?? 24);
    const run = async () => {
      try {
        await imageNode.decode();
        if (abort.signal.aborted) return;
        const width = imageNode.naturalWidth,
          height = imageNode.naturalHeight;
        setSize({ width, height });
        if (original.current.w && original.current.h)
          setBox({
            x: original.current.x,
            y: original.current.y,
            w: original.current.w,
            h: original.current.h,
          });
        let tree;
        try {
          tree = await request(
            asset(model.base, `../${model.reference}/raw/${nodesFile(raw)}`),
            { optional: true, signal: abort.signal },
          );
        } catch (e) {
          if (e.name === "AbortError") return;
          setTreeMessage(
            "The tree could not load. Draw a box or recapture to add element selection.",
          );
          return;
        }
        if (abort.signal.aborted) return;
        if (!tree) {
          setTreeMessage(
            "No accessibility tree for this capture. Draw a box, or recapture to add element selection.",
          );
          return;
        }
        if (tree.width !== width || tree.height !== height) {
          setTreeMessage(
            "The tree and capture sizes differ. Recapture before using element selection.",
          );
          return;
        }
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
          const old = original.current,
            byId = old.targetId && valid.filter((n) => n.id === old.targetId),
            candidate = byId
              ? byId.length === 1
                ? byId[0]
                : null
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
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            "The reference capture could not load. Capture the reference language first, then reopen the picker.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    run();
    return () => abort.abort();
  }, [raw, url, device, imageNode]);
  const spec = () => {
    if (!box) return null;
    const value = { ...original.current };
    if (manual) targetKeys.forEach((key) => delete value[key]);
    if (selected && mode === "element") {
      targetKeys.forEach((key) => delete value[key]);
      Object.assign(value, {
        target: selected.path,
        targetMode: "element",
        ...(selected.cls ? { targetClass: selected.cls } : {}),
        ...(selected.id &&
        nodes.filter((n) => n.id === selected.id).length === 1
          ? { targetId: selected.id }
          : {}),
      });
    }
    Object.assign(
      value,
      Object.fromEntries(
        Object.entries(box).map(([k, v]) => [k, Math.round(v)]),
      ),
      { mag: Number(mag), radius: Number(radius) },
    );
    if (device) value.device = device;
    else delete value.device;
    return value;
  };
  const value = spec(),
    valid =
      value &&
      size &&
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
      value.mag >= 1 &&
      value.mag <= 3 &&
      value.radius >= 0 &&
      (value.targetMode !== "element" || !!selected);
  const at = (x, y) =>
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
  const point = (e) => {
    const rect = imageNode.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          size.width,
          ((e.clientX - rect.left) * size.width) / rect.width,
        ),
      ),
      Math.max(
        0,
        Math.min(
          size.height,
          ((e.clientY - rect.top) * size.height) / rect.height,
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
  const drawStyle = (b) => ({
    left: `${(b.x / size.width) * 100}%`,
    top: `${(b.y / size.height) * 100}%`,
    width: `${(b.w / size.width) * 100}%`,
    height: `${(b.h / size.height) * 100}%`,
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
  const write = async (clear) => {
    if (busy || (!clear && !valid)) return;
    setBusy(true);
    setError("");
    try {
      const gallery = await request(asset(model.base, "../gallery.json"));
      const target = Array.isArray(gallery[kind])
        ? gallery[kind][index]
        : gallery[kind].cards[index];
      if (clear) {
        if (Array.isArray(gallery[kind])) delete target.callouts;
        else target.callouts = [];
      } else target.callouts = [value];
      await saveGallery(gallery);
      toast.success(clear ? "Callouts removed" : "Callout saved");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
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
                ref={setImageNode}
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
              )}{" "}
              {hovered &&
                mode === "element" &&
                size &&
                hovered.path !== selected?.path && (
                  <div
                    className="pointer-events-none absolute border border-dashed border-sky-600 bg-sky-500/10"
                    style={drawStyle({
                      x: hovered.b[0],
                      y: hovered.b[1],
                      w: hovered.b[2] - hovered.b[0],
                      h: hovered.b[3] - hovered.b[1],
                    })}
                  />
                )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              write(false);
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
              onValueChange={(v) => {
                if (v === "box") manualMode();
                else setMode("element");
              }}
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
                          {name(n)}
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
                      onCheckedChange={setContainers}
                    />
                    Containers
                  </Label>
                </div>
                {selected && (
                  <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
                    <p className="font-medium break-words">{name(selected)}</p>
                    <p className="text-muted-foreground">
                      {value.targetId
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
                      onClick={() => selectNode(parent)}
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
                  {[
                    ["x", "X"],
                    ["y", "Y"],
                    ["w", "Width"],
                    ["h", "Height"],
                  ].map(([key, label]) => (
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
                {busy ? <Loader2 className="animate-spin" /> : <Save />}Save
                callout
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!valid}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(JSON.stringify(value))
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
                  onClick={() => write(true)}
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
