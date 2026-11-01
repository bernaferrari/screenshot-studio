import {
  useCallback,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClientSize } from "@/lib/hooks";
import { reportProblems } from "@/lib/report";
import {
  fitScale,
  maxZoom as maxZoomFor,
  toggledZoom,
  viewerKeys,
  viewerReducer,
  viewerState,
  type ViewerCommand,
} from "@/lib/viewer";
import type { ViewerSession } from "./media-viewer";
import { ThumbnailStrip } from "./thumbnail-strip";
import { useStageGestures } from "./use-stage-gestures";
import { useTopmostEscape } from "./use-topmost-escape";
import { ViewerStage } from "./viewer-stage";
import { ViewerToolbar } from "./viewer-toolbar";

/** The image viewer: one image at a time, zoomable, with every other image a thumbnail away. */
export function ViewerDialog({
  session,
  close,
  restoreFocus,
}: {
  session: ViewerSession;
  close(): void;
  restoreFocus(event: Event): void;
}) {
  const { items, title, notice } = session,
    count = items.length,
    [state, dispatch] = useReducer(viewerReducer, session.index, viewerState),
    [stage, setStage] = useState<HTMLDivElement | null>(null),
    bounds = useClientSize(stage),
    content = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const { index, zoom, natural, loaded, error, fallback, retry } = state,
    item = items[index],
    live = item.type === "live" || fallback,
    resourceKey = `${item.id || item.src || item.previewURL}:${live}:${retry}`,
    size =
      natural?.key === resourceKey
        ? natural
        : item.width && item.height
          ? { width: item.width, height: item.height }
          : { width: 400, height: 800 },
    fit = fitScale(bounds, size),
    scale = fit * zoom,
    maxZoom = maxZoomFor(fit),
    multiple = count > 1;
  const gestures = useStageGestures({
    stage,
    enabled: loaded && !error,
    zoom,
    maxZoom,
    swipes: multiple,
    dispatch,
    move,
  });
  const { reset } = gestures;
  const choose = useCallback(
    (next: number) => {
      reset();
      dispatch({ type: "choose", index: next, count });
    },
    [count, reset],
  );
  const changeZoom = useCallback(
    (to: number) => {
      reset();
      dispatch({ type: "zoom", to, max: maxZoom });
    },
    [maxZoom, reset],
  );
  function move(direction: number) {
    choose(index + direction);
  }
  useTopmostEscape(content, close);

  const commands: Record<ViewerCommand, () => void> = {
    previous: () => multiple && move(-1),
    next: () => multiple && move(1),
    first: () => choose(0),
    last: () => choose(count - 1),
    zoomIn: () => changeZoom(zoom * 1.5),
    zoomOut: () => changeZoom(zoom / 1.5),
    fit: () => changeZoom(1),
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      event.target instanceof Element &&
      event.target.closest('input,textarea,[role="slider"]')
    )
      return;
    const command = viewerKeys[event.key];
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    commands[command]();
  };
  const problems = reportProblems(state.report);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        ref={content}
        showCloseButton={false}
        style={{ animation: "none" }}
        overlayClassName="bg-black/80 backdrop-blur-sm"
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus();
        }}
        onKeyDown={keyboard}
        data-image-index={index}
        data-media-type={live ? "live" : "image"}
        className="image-viewer grid h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-white/15 bg-neutral-950 p-0 text-neutral-100 shadow-2xl transition-none sm:h-[min(900px,calc(100dvh-3rem))] sm:max-w-[min(1200px,calc(100vw-3rem))]"
      >
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="min-w-0 py-1">
            <DialogTitle className="truncate text-sm font-medium">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate text-xs text-neutral-400">
              {item.title}
              {item.description ? ` · ${item.description}` : ""}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs text-neutral-400 tabular-nums">
              {index + 1} / {count}
            </span>
            <Button
              type="button"
              ref={closeButton}
              variant="ghost"
              size="icon"
              aria-label="Close image viewer"
              onClick={close}
              className="size-10 shrink-0 text-neutral-200 hover:bg-white/10 hover:text-white focus-visible:ring-white/60"
            >
              <X />
            </Button>
          </div>
        </div>
        <ViewerStage
          item={item}
          live={live}
          resourceKey={resourceKey}
          size={size}
          scale={scale}
          bounds={bounds}
          state={state}
          multiple={multiple}
          stage={stage}
          stageRef={setStage}
          gestures={gestures.handlers}
          dispatch={dispatch}
          move={move}
          onDoubleClick={() => changeZoom(toggledZoom(zoom, fit, maxZoom))}
        />
        <div className="min-w-0 border-t border-white/10 bg-neutral-950">
          <ViewerToolbar
            item={item}
            live={live}
            zoom={zoom}
            scale={scale}
            fit={fit}
            maxZoom={maxZoom}
            loaded={loaded}
            error={error}
            draft={problems.length > 0}
            onZoom={changeZoom}
          />
          {problems.length > 0 && loaded && (
            <p
              className="px-4 pb-3 text-xs leading-relaxed text-amber-200"
              role="status"
            >
              {problems.join(" · ")}
            </p>
          )}
          {notice && (
            <p
              className="px-4 pb-3 text-xs leading-relaxed text-amber-200"
              role="status"
            >
              {notice}
            </p>
          )}
          {multiple && (
            <ThumbnailStrip items={items} index={index} onSelect={choose} />
          )}
          <p className="sr-only" aria-live="polite">
            {item.title}. Screenshot {index + 1} of {count}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
