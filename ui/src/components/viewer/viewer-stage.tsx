import {
  useLayoutEffect,
  type Dispatch,
  type DOMAttributes,
  type Ref,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/media";
import {
  centred,
  zoomedIn,
  type Size,
  type ViewerEvent,
  type ViewerState,
} from "@/lib/viewer";
import { useLiveReady } from "./use-live-ready";
import { ViewerAction } from "./viewer-action";

/** The scrollable stage: the image or live preview at its scale, with loading, error and previous/next overlays. */
export function ViewerStage({
  item,
  live,
  resourceKey,
  size,
  scale,
  bounds,
  state,
  multiple,
  stage,
  stageRef,
  gestures,
  dispatch,
  move,
  onDoubleClick,
}: {
  item: MediaItem;
  live: boolean;
  /** Changes whenever the shown resource does, reloading it. */
  resourceKey: string;
  size: Size;
  scale: number;
  bounds: Size;
  state: ViewerState;
  multiple: boolean;
  stage: HTMLDivElement | null;
  stageRef: Ref<HTMLDivElement>;
  gestures: DOMAttributes<HTMLDivElement>;
  dispatch: Dispatch<ViewerEvent>;
  move(direction: number): void;
  onDoubleClick(): void;
}) {
  const { zoom, loaded, error } = state,
    { frame, onLoad, stop } = useLiveReady(dispatch),
    width = size.width * scale,
    height = size.height * scale;
  useLayoutEffect(() => {
    if (!stage) return;
    const { left, top } = centred(size, scale, bounds);
    stage.scrollLeft = left;
    stage.scrollTop = top;
    // Recentre when the image, its scale or the stage changes; not while panning.
  }, [resourceKey, scale, bounds.width, bounds.height, stage]);
  return (
    <div className="relative min-h-0 min-w-0 bg-black/40">
      <div
        ref={stageRef}
        aria-busy={!loaded && !error}
        className={`image-viewer-stage h-full w-full overflow-auto overscroll-contain ${zoomedIn(zoom) ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        style={{ touchAction: zoomedIn(zoom) ? "none" : "pan-y" }}
        {...gestures}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={{
            width: Math.max(bounds.width, width + 32),
            height: Math.max(bounds.height, height + 32),
          }}
        >
          <div className="relative shrink-0" style={{ width, height }}>
            {live ? (
              <iframe
                key={resourceKey}
                ref={frame}
                src={item.previewURL}
                title={`${item.title} enlarged live preview`}
                tabIndex={-1}
                onLoad={onLoad}
                width={size.width}
                height={size.height}
                className={`pointer-events-none block origin-top-left border-0 ${loaded ? "preview-ready" : ""}`}
                style={{
                  transform: `scale(${scale})`,
                  opacity: loaded && !error ? 1 : 0,
                }}
              />
            ) : (
              <img
                key={resourceKey}
                src={item.src}
                alt={item.title}
                draggable={false}
                onLoad={(event) =>
                  dispatch({
                    type: "loaded",
                    natural: {
                      key: resourceKey,
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    },
                  })
                }
                onError={() =>
                  dispatch({
                    type: "failed",
                    error:
                      "This image could not be loaded. The file may have moved or may not have been exported yet.",
                  })
                }
                className="pointer-events-none block max-w-none select-none"
                style={{ width, height, opacity: loaded && !error ? 1 : 0 }}
              />
            )}
          </div>
        </div>
      </div>
      {!loaded && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 text-sm text-neutral-300">
          <Loader2 className="size-5 animate-spin" />
          Loading {live ? "live preview" : "image"}…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/95 p-8 text-center">
          <ImageIcon className="size-8 text-neutral-500" />
          <p
            role="alert"
            className="max-w-sm text-sm leading-relaxed text-neutral-300"
          >
            {error}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                stop();
                dispatch({ type: "retry" });
              }}
            >
              <RefreshCw />
              Try again
            </Button>
            {!live && item.previewURL && (
              <Button onClick={() => dispatch({ type: "live" })}>
                Use live preview
              </Button>
            )}
          </div>
        </div>
      )}
      {multiple && (
        <div className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between sm:inset-x-4">
          <ViewerAction
            label="Previous screenshot"
            onClick={() => move(-1)}
            className="pointer-events-auto size-11 rounded-full border border-white/20 bg-black/65 text-white hover:bg-white/15"
          >
            <ChevronLeft />
          </ViewerAction>
          <ViewerAction
            label="Next screenshot"
            onClick={() => move(1)}
            className="pointer-events-auto size-11 rounded-full border border-white/20 bg-black/65 text-white hover:bg-white/15"
          >
            <ChevronRight />
          </ViewerAction>
        </div>
      )}
    </div>
  );
}
