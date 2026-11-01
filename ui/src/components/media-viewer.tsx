import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  Maximize,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { asset } from "@/lib/api";
import { language, pretty } from "@/lib/format";
import { outputFile, type ProjectModel } from "@/lib/project";
import type { Source } from "@/lib/route";
import type { Card, CardReport } from "@/lib/types";

/** One image in the viewer: a file, or a card's live preview page. */
export interface MediaItem {
  id: string;
  type: "image" | "live";
  src: string;
  /** The live page for a card; offered when its exported image is missing. */
  previewURL?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  title: string;
  description?: string;
  filename?: string;
}
export interface ViewerRequest {
  items: MediaItem[];
  index?: number;
  title?: string;
  /** A note shown under the image (the preview uses saved words, say). */
  notice?: string;
}
type OpenViewer = (request: ViewerRequest, trigger?: Element | null) => void;

const ViewerContext = createContext<OpenViewer | null>(null);
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const smooth = (): ScrollBehavior =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";

export const previewURL = (
  model: ProjectModel,
  locale: string,
  kind: string,
  index: number,
  revision: string | number = 0,
): string =>
  asset(
    model.base,
    `preview.html?locale=${encodeURIComponent(locale)}&kind=${encodeURIComponent(kind)}&slide=${index}&revision=${revision}`,
  );
export const exportURL = (
  model: ProjectModel,
  locale: string,
  kind: string,
  card: Card,
  index: number,
  revision: string | number = 0,
): string =>
  asset(
    model.base,
    `../${locale}/${outputFile(kind, card, index)}${revision ? `?v=${revision}` : ""}`,
  );

/** A gallery's cards as viewer items, live or exported. */
export function artworkMedia(
  model: ProjectModel,
  locale: string,
  kind: string,
  cards: Card[],
  {
    source = "live",
    start = 0,
    revision = 0,
  }: { source?: Source; start?: number; revision?: string | number } = {},
): MediaItem[] {
  const profile = model.profiles[kind];
  return cards.map((card, offset) => {
    const index = start + offset,
      src = exportURL(model, locale, kind, card, index);
    return {
      id: `${model.base}:${locale}:${kind}:${index}:${source}:${revision}`,
      type: source === "exported" ? "image" : "live",
      src,
      previewURL: previewURL(model, locale, kind, index, revision),
      thumbnail: src,
      width: profile.width,
      height: profile.height,
      title: pretty(card.feature),
      description: `${language(locale)} · ${profile.label || pretty(kind)} · ${source === "exported" ? "Exported artwork" : "Live artwork"}`,
      filename: outputFile(kind, card, index).split("/").at(-1),
    };
  });
}

interface Session extends ViewerRequest {
  index: number;
  key: string;
}

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    trigger = useRef<Element | null>(null),
    location = useLocation();
  useEffect(() => setSession(null), [location.key]);
  const open = useCallback<OpenViewer>(
    ({ items, index = 0, title = "Screenshot gallery", notice }, element) => {
      if (!items.length) return;
      trigger.current = element || document.activeElement;
      setSession({
        items,
        index: clamp(index, 0, items.length - 1),
        title,
        notice,
        key: crypto.randomUUID(),
      });
    },
    [],
  );
  const restoreFocus = useCallback((event: Event) => {
    event.preventDefault();
    const element = trigger.current;
    requestAnimationFrame(() => {
      if (
        element instanceof HTMLElement &&
        element.isConnected &&
        !element.closest("[hidden],[inert]")
      )
        element.focus({ preventScroll: true });
    });
  }, []);
  return (
    <ViewerContext.Provider value={open}>
      {children}
      {session && (
        <MediaViewer
          key={session.key}
          session={session}
          close={() => setSession(null)}
          restoreFocus={restoreFocus}
        />
      )}
    </ViewerContext.Provider>
  );
}

export function useMediaViewer(): OpenViewer {
  const open = useContext(ViewerContext);
  if (!open) throw new Error("Image viewers require MediaViewerProvider.");
  return open;
}

function ViewerAction({
  label,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={`size-10 shrink-0 text-neutral-200 hover:bg-white/10 hover:text-white focus-visible:ring-white/60 disabled:text-neutral-600 ${className || ""}`}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Thumbnail({
  item,
  index,
  active,
  onSelect,
  buttonRef,
}: {
  item: MediaItem;
  index: number;
  active: boolean;
  onSelect(): void;
  buttonRef(node: HTMLButtonElement | null): void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      ref={buttonRef}
      aria-label={`Show screenshot ${index + 1}: ${item.title}`}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
      className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-md border p-1 hover:bg-white/10 focus-visible:ring-white/60 sm:h-18 sm:w-14 ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-white/15 bg-white/5 opacity-70 hover:opacity-100"}`}
    >
      {!failed && (item.thumbnail || item.src) ? (
        <img
          src={item.thumbnail || item.src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          className="pointer-events-none size-full object-contain"
        />
      ) : (
        <ImageIcon className="size-5 text-neutral-400" />
      )}
      <span className="absolute right-0 bottom-0 rounded-tl bg-black/80 px-1 text-[10px] text-white tabular-nums">
        {index + 1}
      </span>
      {active && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 rounded-full bg-primary p-0.5 text-primary-foreground"
        >
          <Check className="size-2.5" />
        </span>
      )}
    </Button>
  );
}

type Gesture =
  | { type: "pinch"; distance: number; zoom: number }
  | { type: "pan" | "swipe"; x: number; y: number; left: number; top: number };

const reportProblems = (report: CardReport | null): string[] =>
  report
    ? [
        report.missingCopy?.length ? "Untranslated copy" : null,
        report.fallbackCaptures?.length ? "Reference capture borrowed" : null,
        report.fixedCallouts?.length ? "Callout needs review" : null,
        report.fit === 0 ? "Copy is too long" : null,
      ].filter((text): text is string => !!text)
    : [];

function MediaViewer({
  session,
  close,
  restoreFocus,
}: {
  session: Session;
  close(): void;
  restoreFocus(event: Event): void;
}) {
  const { items, title, notice } = session,
    [index, setIndex] = useState(session.index),
    [zoom, setZoom] = useState(1),
    [natural, setNatural] = useState<{
      key: string;
      width: number;
      height: number;
    } | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [fallback, setFallback] = useState(false),
    [retry, setRetry] = useState(0),
    [report, setReport] = useState<CardReport | null>(null),
    [bounds, setBounds] = useState({ width: 0, height: 0 }),
    [viewport, setViewport] = useState<HTMLDivElement | null>(null),
    frame = useRef<HTMLIFrameElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null),
    thumbs = useRef<HTMLDivElement>(null),
    thumbnailButtons = useRef(new Map<number, HTMLButtonElement>()),
    poll = useRef<number | undefined>(undefined),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<Gesture | null>(null);
  const item = items[index],
    isLive = item.type === "live" || fallback,
    resourceKey = `${item.id || item.src || item.previewURL}:${isLive}:${retry}`,
    dimensions =
      natural?.key === resourceKey
        ? natural
        : item.width && item.height
          ? { width: item.width, height: item.height }
          : { width: 400, height: 800 };
  const fit =
      bounds.width && bounds.height
        ? Math.min(
            1,
            Math.max(1, bounds.width - 32) / dimensions.width,
            Math.max(1, bounds.height - 32) / dimensions.height,
          )
        : 0,
    scale = fit * zoom,
    maxZoom = Math.max(16, fit ? 1 / fit : 16),
    multiple = items.length > 1;
  const resetGesture = () => {
    pointers.current.clear();
    gesture.current = null;
  };
  const choose = useCallback(
    (next: number) => {
      const selected = (next + items.length) % items.length;
      setZoom(1);
      resetGesture();
      if (selected === index) return;
      setIndex(selected);
      setNatural(null);
      setLoaded(false);
      setError("");
      setFallback(false);
      setReport(null);
    },
    [items.length, index],
  );
  const move = (direction: number) => choose(index + direction);
  useLayoutEffect(() => {
    if (!viewport) return;
    const update = () =>
      setBounds({ width: viewport.clientWidth, height: viewport.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);
  useEffect(() => {
    const node = thumbs.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ),
      button = thumbnailButtons.current.get(index);
    if (!node || !button) return;
    const rect = node.getBoundingClientRect(),
      b = button.getBoundingClientRect();
    node.scrollTo({
      left:
        node.scrollLeft + b.left - rect.left - (node.clientWidth - b.width) / 2,
      behavior: smooth(),
    });
  }, [index, viewport]);
  useEffect(() => () => window.clearInterval(poll.current), []);
  useEffect(() => {
    // Escape closes the viewer only when it is the topmost dialog.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const dialogs = [
        ...document.querySelectorAll(
          '[role="dialog"][aria-modal="true"], [role="dialog"][data-slot="dialog-content"]',
        ),
      ].filter((node) => node.getClientRects().length);
      if (dialogs.at(-1) !== content.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [close]);
  useEffect(() => {
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !loaded || error) return;
      event.preventDefault();
      setZoom((previous) =>
        clamp(previous * Math.exp(-event.deltaY * 0.01), 1, maxZoom),
      );
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, [viewport, maxZoom, loaded, error]);
  useLayoutEffect(() => {
    if (!viewport) return;
    viewport.scrollLeft = Math.max(
      0,
      (dimensions.width * scale - bounds.width) / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      (dimensions.height * scale - bounds.height) / 2,
    );
    // Recentre when the image, its scale or the stage changes; not while panning.
  }, [resourceKey, scale, bounds.width, bounds.height, viewport]);
  const changeZoom = (next: number) => {
    setZoom(clamp(next, 1, maxZoom));
    resetGesture();
  };
  const liveLoaded = () => {
    window.clearInterval(poll.current);
    const node = frame.current,
      start = Date.now();
    const check = () => {
      if (node !== frame.current) return window.clearInterval(poll.current);
      const root = node?.contentDocument?.documentElement;
      if (root?.dataset.ready === "true") {
        setReport(JSON.parse(root.dataset.report || "{}") as CardReport);
        setLoaded(true);
        window.clearInterval(poll.current);
      } else if (Date.now() - start > 25000) {
        setError(
          "This live preview could not finish loading. Try again or open the original preview.",
        );
        window.clearInterval(poll.current);
      }
    };
    poll.current = window.setInterval(check, 120);
    check();
  };
  const retryLoad = () => {
    window.clearInterval(poll.current);
    setRetry((value) => value + 1);
    setError("");
    setLoaded(false);
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!loaded || error || event.button !== 0) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      };
      return;
    }
    gesture.current = {
      type: zoom > 1.01 ? "pan" : "swipe",
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!pointers.current.has(event.pointerId) || !g) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (g.type === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(
        clamp(
          (g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.distance),
          1,
          maxZoom,
        ),
      );
    } else if (g.type === "pan") {
      event.currentTarget.scrollLeft = g.left - (event.clientX - g.x);
      event.currentTarget.scrollTop = g.top - (event.clientY - g.y);
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (g?.type === "swipe" && multiple) {
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y,
        threshold = Math.min(96, bounds.width * 0.18);
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.25)
        move(dx < 0 ? 1 : -1);
    }
    if (!pointers.current.size) gesture.current = null;
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (
      event.target instanceof Element &&
      event.target.closest('input,textarea,[role="slider"]')
    )
      return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => multiple && move(-1),
      ArrowRight: () => multiple && move(1),
      Home: () => choose(0),
      End: () => choose(items.length - 1),
      "+": () => changeZoom(zoom * 1.5),
      "=": () => changeZoom(zoom * 1.5),
      "-": () => changeZoom(zoom / 1.5),
      "0": () => changeZoom(1),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action();
    }
  };
  const problems = reportProblems(report);
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
        data-media-type={isLive ? "live" : "image"}
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
              {index + 1} / {items.length}
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
        <div className="relative min-h-0 min-w-0 bg-black/40">
          <div
            ref={setViewport}
            aria-busy={!loaded && !error}
            className={`image-viewer-stage h-full w-full overflow-auto overscroll-contain ${zoom > 1.01 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
            style={{ touchAction: zoom > 1.01 ? "none" : "pan-y" }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={resetGesture}
            onDoubleClick={() =>
              changeZoom(
                zoom > 1.01
                  ? 1
                  : Math.max(1, Math.min(maxZoom, 1 / Math.max(0.01, fit))),
              )
            }
          >
            <div
              className="flex min-h-full min-w-full items-center justify-center"
              style={{
                width: Math.max(bounds.width, dimensions.width * scale + 32),
                height: Math.max(bounds.height, dimensions.height * scale + 32),
              }}
            >
              <div
                className="relative shrink-0"
                style={{
                  width: dimensions.width * scale,
                  height: dimensions.height * scale,
                }}
              >
                {isLive ? (
                  <iframe
                    key={resourceKey}
                    ref={frame}
                    src={item.previewURL}
                    title={`${item.title} enlarged live preview`}
                    tabIndex={-1}
                    onLoad={liveLoaded}
                    width={dimensions.width}
                    height={dimensions.height}
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
                    onLoad={(event) => {
                      setNatural({
                        key: resourceKey,
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                      setLoaded(true);
                    }}
                    onError={() =>
                      setError(
                        "This image could not be loaded. The file may have moved or may not have been exported yet.",
                      )
                    }
                    className="pointer-events-none block max-w-none select-none"
                    style={{
                      width: dimensions.width * scale,
                      height: dimensions.height * scale,
                      opacity: loaded && !error ? 1 : 0,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          {!loaded && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 text-sm text-neutral-300">
              <Loader2 className="size-5 animate-spin" />
              Loading {isLive ? "live preview" : "image"}…
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
                <Button variant="secondary" onClick={retryLoad}>
                  <RefreshCw />
                  Try again
                </Button>
                {!isLive && item.previewURL && (
                  <Button
                    onClick={() => {
                      setFallback(true);
                      setError("");
                      setLoaded(false);
                      setZoom(1);
                    }}
                  >
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
        <div className="min-w-0 border-t border-white/10 bg-neutral-950">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <div className="flex items-center gap-0.5">
              <ViewerAction
                label="Zoom out"
                onClick={() => changeZoom(zoom / 1.5)}
                disabled={zoom <= 1.001 || !!error}
              >
                <Minus />
              </ViewerAction>
              <span
                className="w-12 text-center text-xs text-neutral-300 tabular-nums"
                role="status"
                aria-label="Image zoom"
              >
                {Math.round(scale * 100)}%
              </span>
              <ViewerAction
                label="Zoom in"
                onClick={() => changeZoom(zoom * 1.5)}
                disabled={zoom >= maxZoom || !!error}
              >
                <Plus />
              </ViewerAction>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Fit image"
                onClick={() => changeZoom(1)}
                className={`text-xs text-neutral-300 hover:bg-white/10 hover:text-white ${zoom === 1 ? "bg-white/10" : ""}`}
              >
                <Maximize className="size-3.5" />
                Fit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Actual image size"
                onClick={() => changeZoom(1 / Math.max(0.0001, fit))}
                className="text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
              >
                1:1
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={`hidden rounded px-2 py-1 text-[11px] sm:block ${problems.length ? "bg-amber-400/10 text-amber-200" : "text-neutral-400"}`}
              >
                {problems.length
                  ? "Draft artwork · review required"
                  : isLive
                    ? "Live artwork"
                    : "Original image"}
              </span>
              {!isLive && loaded && !error && (
                <ViewerAction asChild label="Download image">
                  <a
                    href={item.src}
                    download={item.filename || item.src.split("/").at(-1)}
                  >
                    <Download />
                  </a>
                </ViewerAction>
              )}
              <ViewerAction
                asChild
                label={
                  isLive
                    ? "Open full preview in new tab"
                    : "Open original in new tab"
                }
              >
                <a
                  href={isLive ? `${item.previewURL}&fit` : item.src}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink />
                </a>
              </ViewerAction>
            </div>
          </div>
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
            <ScrollArea
              ref={thumbs}
              type="auto"
              className="w-full border-t border-white/10"
            >
              <div className="flex w-max min-w-full justify-center gap-2 px-4 py-3">
                {items.map((media, i) => (
                  <Thumbnail
                    key={media.id || `${media.src}-${i}`}
                    item={media}
                    index={i}
                    active={i === index}
                    onSelect={() => choose(i)}
                    buttonRef={(node) => {
                      if (node) thumbnailButtons.current.set(i, node);
                    }}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
          <p className="sr-only" aria-live="polite">
            {item.title}. Screenshot {index + 1} of {items.length}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
