import { useEffect, useReducer, useState } from "react";
import { MousePointer2, Scan } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Choice, ErrorNotice, Status } from "@/components/common";
import { asset, errorMessage, request } from "@/lib/api";
import {
  pickedCallout,
  pickReducer,
  placeCallout,
  savedCallout,
  savedNode,
  startPick,
  validCallout,
} from "@/lib/callout";
import { copyText, pretty } from "@/lib/format";
import {
  devicesFor,
  nodesFile,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Card, Galleries } from "@/lib/types";
import { CalloutSettings } from "./callout-settings";
import { CaptureStage } from "./capture-stage";
import { ElementList } from "./element-list";
import { PickerActions } from "./picker-actions";
import { useReferenceCapture } from "./use-reference-capture";

export interface PickerSelection {
  card: Card;
  kind: string;
  index: number;
}

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
    saved = savedCallout(card, device),
    [pick, dispatch] = useReducer(pickReducer, saved, startPick),
    [query, setQuery] = useState(""),
    [containers, setContainers] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState<HTMLImageElement | null>(null);
  const raw = devices[device]?.raw,
    reference = `../${model.reference}/raw/`,
    url = asset(model.base, reference + raw),
    capture = useReferenceCapture(
      image,
      url,
      asset(model.base, reference + nodesFile(raw)),
    ),
    { size, nodes } = capture;

  // Start from the saved callout: its box once the capture's size is known, its element once the layout map is.
  // These follow the capture alone; the card is fixed for the picker's lifetime and a new device resets the pick.
  useEffect(() => {
    if (size && saved.w && saved.h)
      dispatch({
        type: "restore",
        box: { x: saved.x || 0, y: saved.y || 0, w: saved.w, h: saved.h },
      });
  }, [size]);
  useEffect(() => {
    if (!nodes.length || pick.drawn) return;
    const node = savedNode(saved, nodes);
    dispatch(
      node
        ? { type: "select", node }
        : { type: "elements", missing: saved.targetMode === "element" },
    );
  }, [nodes]);

  const value = pickedCallout(pick, saved, nodes, device),
    valid =
      !!value &&
      !!size &&
      !capture.loading &&
      !busy &&
      validCallout(value, size, pick.selected);
  const chooseDevice = (next: number) => {
    setDevice(next);
    setError("");
    dispatch({ type: "reset", saved: savedCallout(card, next) });
  };
  const write = async (clear: boolean) => {
    if (busy || (!clear && !valid)) return;
    setBusy(true);
    setError("");
    try {
      // Edit the file as it is now, so callouts saved elsewhere since the editor loaded survive.
      const gallery = await request<Galleries>(
        asset(model.base, "../gallery.json"),
      );
      placeCallout(
        gallery,
        kind,
        index,
        clear ? null : value,
        device,
        card.callouts,
      );
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
            <CaptureStage
              url={url}
              image={image}
              imageRef={setImage}
              size={size}
              nodes={nodes}
              containers={containers}
              pick={pick}
              busy={busy}
              dispatch={dispatch}
            />
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
                onChange={(v) => chooseDevice(Number(v))}
                items={devices.map((d, i) => ({
                  value: String(i),
                  label: d.role ? pretty(d.role) : `Device ${i + 1}`,
                }))}
                className="w-full"
              />
            )}
            <Tabs
              value={pick.mode}
              onValueChange={(v) =>
                dispatch({ type: v === "box" ? "draw" : "elements" })
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
              {pick.missing
                ? "The saved element is missing or incompatible. Select it again or draw a box."
                : capture.message}
            </p>
            {pick.mode === "element" && (
              <ElementList
                nodes={nodes}
                selected={pick.selected}
                query={query}
                onQuery={setQuery}
                containers={containers}
                onContainers={setContainers}
                pinnedById={!!value?.targetId}
                dispatch={dispatch}
              />
            )}
            <Status>
              {value
                ? `${value.w} × ${value.h} px`
                : "Select an element or draw a box"}
            </Status>
            <CalloutSettings pick={pick} value={value} dispatch={dispatch} />
            {(error || capture.error) && (
              <ErrorNotice message={error || capture.error} />
            )}
            <PickerActions
              valid={valid}
              busy={busy}
              removable={!!card.callouts?.length}
              onCopy={() =>
                copyText(JSON.stringify(value))
                  .then(() => toast.success("Callout JSON copied"))
                  .catch(() =>
                    setError(
                      "Clipboard access is unavailable. Copy the JSON in Precise selection.",
                    ),
                  )
              }
              onRemove={() => void write(true)}
            />
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
