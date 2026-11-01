import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  distance,
  swipeDirection,
  zoomedIn,
  type Point,
  type ViewerEvent,
} from "@/lib/viewer";

type Gesture =
  | { type: "pinch"; distance: number; zoom: number }
  | { type: "pan" | "swipe"; x: number; y: number; left: number; top: number };

/** Pinch and Ctrl/Cmd+wheel to zoom, drag to pan a zoomed image or swipe to the next one. */
export function useStageGestures({
  stage,
  enabled,
  zoom,
  maxZoom,
  swipes,
  dispatch,
  move,
}: {
  stage: HTMLDivElement | null;
  /** The image is loaded and showing. */
  enabled: boolean;
  zoom: number;
  maxZoom: number;
  /** There is another image to swipe to. */
  swipes: boolean;
  dispatch: Dispatch<ViewerEvent>;
  move(direction: number): void;
}) {
  const pointers = useRef(new Map<number, Point>()),
    gesture = useRef<Gesture | null>(null);
  const reset = useCallback(() => {
    pointers.current.clear();
    gesture.current = null;
  }, []);

  useEffect(() => {
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !enabled) return;
      event.preventDefault();
      dispatch({
        type: "zoom",
        by: Math.exp(-event.deltaY * 0.01),
        max: maxZoom,
      });
    };
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [stage, maxZoom, enabled, dispatch]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: "pinch", distance: distance(a, b), zoom };
      return;
    }
    gesture.current = {
      type: zoomedIn(zoom) ? "pan" : "swipe",
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!pointers.current.has(event.pointerId) || !g) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (g.type === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      dispatch({
        type: "zoom",
        to: (g.zoom * distance(a, b)) / Math.max(1, g.distance),
        max: maxZoom,
      });
    } else if (g.type === "pan") {
      event.currentTarget.scrollLeft = g.left - (event.clientX - g.x);
      event.currentTarget.scrollTop = g.top - (event.clientY - g.y);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (g?.type === "swipe" && swipes) {
      const direction = swipeDirection(
        event.clientX - g.x,
        event.clientY - g.y,
        event.currentTarget.clientWidth,
      );
      if (direction) move(direction);
    }
    if (!pointers.current.size) gesture.current = null;
  };
  return {
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}
