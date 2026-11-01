// The image viewer's state and geometry, apart from the DOM.
import type { CardReport } from "./types";

export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

export interface ViewerState {
  index: number;
  /** On top of the fitted scale: 1 shows the whole image. */
  zoom: number;
  /** The image's own size, measured on the resource `key`. */
  natural: (Size & { key: string }) | null;
  loaded: boolean;
  error: string;
  /** The exported image failed, so its live preview stands in. */
  fallback: boolean;
  /** Bumped by Try again, to load the resource afresh. */
  retry: number;
  /** What the live preview noticed about its card. */
  report: CardReport | null;
}

export type ViewerEvent =
  | { type: "choose"; index: number; count: number }
  /** Zoom to `to` (or the current zoom) times `by`, within [1, max]. */
  | { type: "zoom"; to?: number; by?: number; max: number }
  | { type: "loaded"; natural?: ViewerState["natural"]; report?: CardReport }
  | { type: "failed"; error: string }
  | { type: "retry" }
  | { type: "live" };

export const viewerState = (index: number): ViewerState => ({
  index,
  zoom: 1,
  natural: null,
  loaded: false,
  error: "",
  fallback: false,
  retry: 0,
  report: null,
});

export function viewerReducer(
  state: ViewerState,
  action: ViewerEvent,
): ViewerState {
  switch (action.type) {
    case "choose": {
      const index = (action.index + action.count) % action.count;
      if (index !== state.index)
        return { ...viewerState(index), retry: state.retry };
      return state.zoom === 1 ? state : { ...state, zoom: 1 };
    }
    case "zoom": {
      const zoom = clamp(
        (action.to ?? state.zoom) * (action.by ?? 1),
        1,
        action.max,
      );
      return zoom === state.zoom ? state : { ...state, zoom };
    }
    case "loaded":
      return {
        ...state,
        loaded: true,
        natural: action.natural ?? state.natural,
        report: action.report ?? state.report,
      };
    case "failed":
      return { ...state, error: action.error };
    case "retry":
      return { ...state, retry: state.retry + 1, error: "", loaded: false };
    case "live":
      return { ...state, fallback: true, error: "", loaded: false, zoom: 1 };
  }
}

/** Zoomed past the fitted view, so dragging pans instead of swiping. */
export const zoomedIn = (zoom: number): boolean => zoom > 1.01;

/** The scale that fits `size` in `bounds` with a margin, never enlarging; 0 until the stage is measured. */
export const fitScale = (bounds: Size, size: Size): number =>
  bounds.width && bounds.height
    ? Math.min(
        1,
        Math.max(1, bounds.width - 32) / size.width,
        Math.max(1, bounds.height - 32) / size.height,
      )
    : 0;

/** The most zoom allows: at least 16×, and always the image's actual size. */
export const maxZoom = (fit: number): number =>
  Math.max(16, fit ? 1 / fit : 16);

/** Double click: back to fit when zoomed in, otherwise actual size. */
export const toggledZoom = (zoom: number, fit: number, max: number): number =>
  zoomedIn(zoom) ? 1 : Math.max(1, Math.min(max, 1 / Math.max(0.01, fit)));

/** The scroll offsets that centre `size` at `scale` in `bounds`. */
export const centred = (
  size: Size,
  scale: number,
  bounds: Size,
): { left: number; top: number } => ({
  left: Math.max(0, (size.width * scale - bounds.width) / 2),
  top: Math.max(0, (size.height * scale - bounds.height) / 2),
});

export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Where a released drag moves: 1 to the next image, -1 to the previous, 0 nowhere. */
export function swipeDirection(dx: number, dy: number, width: number): number {
  const threshold = Math.min(96, width * 0.18);
  return Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.25
    ? dx < 0
      ? 1
      : -1
    : 0;
}

export type ViewerCommand =
  "previous" | "next" | "first" | "last" | "zoomIn" | "zoomOut" | "fit";
export const viewerKeys: Record<string, ViewerCommand> = {
  ArrowLeft: "previous",
  ArrowRight: "next",
  Home: "first",
  End: "last",
  "+": "zoomIn",
  "=": "zoomIn",
  "-": "zoomOut",
  "0": "fit",
};
