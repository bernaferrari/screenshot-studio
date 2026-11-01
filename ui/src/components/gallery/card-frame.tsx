import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { exportURL, previewURL } from "@/lib/media";
import type { ProjectModel } from "@/lib/project";
import type { Source } from "@/lib/route";
import type { Card, CardReport } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How a card's preview went. */
export type FrameState =
  | { status: "loading" }
  | { status: "ready"; report: CardReport }
  | { status: "failed" }
  | { status: "missing" };

interface CardFrameProps {
  model: ProjectModel;
  locale: string;
  kind: string;
  card: Card;
  index: number;
  /** Shown height in CSS pixels; the width follows the gallery's shape. */
  height: number;
  source: Source;
  /** Live previews render again, in place, when this changes. */
  revision: string;
  exportRevision?: number;
  onState?(state: FrameState): void;
  className?: string;
  /** Round the corners like a store thumbnail. */
  rounded?: boolean;
}

/**
 * One card at any size: its live preview page (the theme, words and captures as they are on disk now) or its exported
 * image. A new revision loads behind the current preview and replaces it once it has rendered, so live reload never
 * flashes or moves anything.
 */
export function CardFrame({
  model,
  locale,
  kind,
  card,
  index,
  height,
  source,
  revision,
  exportRevision = 0,
  onState,
  className,
  rounded,
}: CardFrameProps) {
  const profile = model.profiles[kind],
    width = (height * profile.width) / profile.height,
    scale = height / profile.height,
    [frames, setFrames] = useState<{ revision: string; ready: boolean }[]>(
      () => [{ revision, ready: false }],
    ),
    [failed, setFailed] = useState(false),
    [poster, setPoster] = useState<string | null>(locale),
    state = useRef(onState);
  state.current = onState;

  useEffect(() => {
    setFrames((old) =>
      old.some((f) => f.revision === revision)
        ? old
        : [...old, { revision, ready: false }],
    );
  }, [revision]);
  useEffect(() => {
    setFailed(false);
    setPoster(locale);
    if (source === "live") state.current?.({ status: "loading" });
  }, [locale, source, exportRevision]);

  const ready = (frame: string, report: CardReport) => {
    // The newest rendered frame wins; older ones leave.
    setFrames((old) => {
      const at = old.findIndex((f) => f.revision === frame);
      return at < 0
        ? old
        : old.slice(at).map((f, i) => (i === 0 ? { ...f, ready: true } : f));
    });
    state.current?.({ status: "ready", report });
  };
  const shown = frames.findLastIndex((f) => f.ready);
  const exported = exportURL(model, locale, kind, card, index, exportRevision);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-muted",
        rounded ? "rounded-lg" : "rounded-md",
        className,
      )}
      style={{ width, height }}
      data-card-frame={source}
    >
      {source === "exported" ? (
        failed ? (
          <div className="missing flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
            <ImageOff className="size-6" />
            <strong className="font-medium">No export yet</strong>
            {height > 220 && <span>Live shows this language's artwork.</span>}
          </div>
        ) : (
          <img
            key={exported}
            src={exported}
            alt={`${card.feature} · exported artwork in ${locale}`}
            onError={() => {
              setFailed(true);
              onState?.({ status: "missing" });
            }}
            className="size-full object-contain"
          />
        )
      ) : (
        <>
          {shown < 0 && poster && (
            <img
              src={exportURL(model, poster, kind, card, index)}
              alt=""
              loading="lazy"
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full object-contain"
              onError={() =>
                setPoster(poster !== model.reference ? model.reference : null)
              }
            />
          )}
          {frames.map((frame, i) => (
            <LiveFrame
              key={frame.revision}
              src={previewURL(model, locale, kind, index, frame.revision)}
              title={`${locale} ${card.feature}`}
              width={profile.width}
              height={profile.height}
              scale={scale}
              visible={i === shown}
              ready={frame.ready}
              onReady={(report) => ready(frame.revision, report)}
              onFail={() => {
                if (shown < 0) state.current?.({ status: "failed" });
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function LiveFrame({
  src,
  title,
  width,
  height,
  scale,
  visible,
  ready,
  onReady,
  onFail,
}: {
  src: string;
  title: string;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
  ready: boolean;
  onReady(report: CardReport): void;
  onFail(): void;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    timer = useRef<number | undefined>(undefined),
    handlers = useRef({ onReady, onFail });
  handlers.current = { onReady, onFail };
  useEffect(() => () => window.clearInterval(timer.current), []);
  const loaded = () => {
    window.clearInterval(timer.current);
    const start = Date.now();
    const check = () => {
      const root = frame.current?.contentDocument?.documentElement;
      if (root?.dataset.ready === "true") {
        window.clearInterval(timer.current);
        handlers.current.onReady(
          JSON.parse(root.dataset.report || "{}") as CardReport,
        );
      } else if (Date.now() - start > 25000) {
        window.clearInterval(timer.current);
        handlers.current.onFail();
      }
    };
    timer.current = window.setInterval(check, 100);
    check();
  };
  return (
    <iframe
      ref={frame}
      tabIndex={-1}
      aria-hidden={!visible}
      src={src}
      title={title}
      width={width}
      height={height}
      loading="lazy"
      onLoad={loaded}
      className={cn(
        "absolute top-0 left-0 block border-0",
        ready && "preview-ready",
      )}
      style={{
        pointerEvents: "none",
        transformOrigin: "0 0",
        transform: `scale(${scale})`,
        opacity: visible ? 1 : 0,
      }}
    />
  );
}
