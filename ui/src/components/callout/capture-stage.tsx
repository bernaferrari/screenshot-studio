import {
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  boxBetween,
  boxStyle,
  capturePoint,
  nodeAt,
  nodeBox,
  type Pick,
  type PickEvent,
} from "@/lib/callout";
import type { UiNode } from "@/lib/types";
import type { Size } from "@/lib/viewer";

/** The reference capture: drag to draw a box, or hover and click an element. */
export function CaptureStage({
  url,
  image,
  imageRef,
  size,
  nodes,
  containers,
  pick,
  busy,
  dispatch,
}: {
  url: string;
  image: HTMLImageElement | null;
  imageRef(image: HTMLImageElement | null): void;
  size: Size | null;
  nodes: UiNode[];
  containers: boolean;
  pick: Pick;
  busy: boolean;
  dispatch: Dispatch<PickEvent>;
}) {
  const start = useRef<[number, number] | null>(null),
    { box, hovered, selected, mode } = pick;
  const point = (e: ReactPointerEvent, size: Size) =>
    capturePoint(e.clientX, e.clientY, image!.getBoundingClientRect(), size);
  return (
    <div
      className="capture-stage relative inline-block max-w-full touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0 || !size || busy) return;
        e.preventDefault();
        start.current = point(e, size);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (mode === "box") dispatch({ type: "draw" });
      }}
      onPointerMove={(e) => {
        if (!size) return;
        const [x, y] = point(e, size);
        if (mode === "element")
          dispatch({
            type: "hover",
            node: nodeAt(nodes, x, y, containers) || null,
          });
        else if (start.current)
          dispatch({ type: "box", box: boxBetween(start.current, [x, y]) });
      }}
      onPointerUp={(e) => {
        if (start.current && mode === "element" && size) {
          const node = nodeAt(nodes, ...point(e, size), containers);
          if (node) dispatch({ type: "select", node });
        }
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onPointerLeave={() => dispatch({ type: "hover", node: null })}
    >
      <img
        ref={imageRef}
        src={url}
        alt="Reference capture"
        draggable={false}
        className="block h-auto max-h-[68dvh] w-auto max-w-full rounded-md border shadow-sm"
      />
      {box && size && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/10"
          style={boxStyle(box, size)}
        />
      )}
      {hovered &&
        mode === "element" &&
        size &&
        hovered.path !== selected?.path && (
          <div
            className="pointer-events-none absolute border border-dashed border-sky-600 bg-sky-500/10"
            style={boxStyle(nodeBox(hovered), size)}
          />
        )}
    </div>
  );
}
