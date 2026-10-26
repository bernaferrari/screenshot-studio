import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2,
  ArrowLeft,
  ArrowRight,
  Crop,
  Image,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { IconButton, Status } from "./common";
import { artworkMedia, useMediaViewer } from "./media-viewer";
import { asset, outputFile, devicesFor, pretty, language } from "@/lib/model";
export const PreviewCard = memo(function PreviewCard({
  model,
  locale,
  kind,
  card,
  index,
  height = 440,
  source = "live",
  onPicker,
  revision = model.revision,
  viewerItems,
  viewerTitle,
  viewerNotice,
}) {
  const openViewer = useMediaViewer();
  const open = (event) =>
    openViewer(
      {
        items:
          viewerItems ||
          artworkMedia(model, locale, kind, [card], source, index),
        index: viewerItems ? index : 0,
        title:
          viewerTitle ||
          `${model.config.app} · ${model.profiles[kind].label || pretty(kind)}`,
        notice: viewerNotice,
      },
      event.currentTarget,
    );
  const profile = model.profiles[kind],
    width = (height * profile.width) / profile.height,
    frame = useRef(null),
    timer = useRef(),
    [report, setReport] = useState(null),
    [failed, setFailed] = useState(false),
    [poster, setPoster] = useState(locale),
    [posterMissing, setPosterMissing] = useState(false),
    [timeout, setTimeoutError] = useState(false);
  const url = `${model.base}preview.html?locale=${encodeURIComponent(locale)}&kind=${encodeURIComponent(kind)}&slide=${index}&revision=${revision}`;
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    setReport(null);
    setFailed(false);
    setTimeoutError(false);
    setPoster(locale);
    setPosterMissing(false);
  }, [url, locale, source]);
  const loaded = () => {
    clearInterval(timer.current);
    const start = Date.now();
    const check = () => {
      const root = frame.current?.contentDocument?.documentElement;
      if (root?.dataset.ready === "true") {
        setReport(JSON.parse(root.dataset.report || "{}"));
        clearInterval(timer.current);
      } else if (Date.now() - start > 25000) {
        setTimeoutError(true);
        clearInterval(timer.current);
      }
    };
    timer.current = setInterval(check, 100);
    check();
  };
  const warnings =
    report &&
    (report.missingCopy?.length ||
      report.fallbackCaptures?.length ||
      report.fixedCallouts?.length ||
      report.fit === 0);
  return (
    <div className="screenshot-card shrink-0" style={{ width }}>
      <Button
        type="button"
        variant="ghost"
        aria-label={`Enlarge ${pretty(card.feature)} screenshot`}
        onClick={open}
        disabled={source === "exported" && failed}
        className="frame relative isolate block cursor-zoom-in overflow-hidden rounded-md border bg-muted p-0 whitespace-normal shadow-sm hover:bg-muted focus-visible:ring-offset-4"
        style={{ width, height }}
      >
        {source === "exported" ? (
          failed ? (
            <div className="missing flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground">
              <Image className="size-7" />
              <strong>No export yet</strong>
              <span>Use Live to review this language’s artwork.</span>
            </div>
          ) : (
            <img
              src={asset(
                model.base,
                `../${locale}/${outputFile(kind, card, index)}`,
              )}
              alt={`${pretty(card.feature)} · exported artwork in ${language(locale)}`}
              onError={() => setFailed(true)}
              className="size-full object-contain"
            />
          )
        ) : (
          <>
            {!report && !posterMissing && (
              <img
                src={asset(
                  model.base,
                  `../${poster}/${outputFile(kind, card, index)}`,
                )}
                alt=""
                loading="lazy"
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full object-contain"
                onError={() => {
                  if (poster !== model.reference) setPoster(model.reference);
                  else setPosterMissing(true);
                }}
              />
            )}
            <iframe
              ref={frame}
              tabIndex={-1}
              src={url}
              title={`${locale} ${card.feature}`}
              width={profile.width}
              height={profile.height}
              loading="lazy"
              onLoad={loaded}
              className={report ? "preview-ready" : ""}
              style={{
                border: 0,
                pointerEvents: "none",
                display: "block",
                transformOrigin: "0 0",
                transform: `scale(${height / profile.height})`,
                opacity: report ? 1 : 0,
              }}
            />
          </>
        )}
      </Button>
      <div className="space-y-2 px-1 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="truncate font-medium">{pretty(card.feature)}</span>
          <div className="ml-auto flex">
            {onPicker && devicesFor(card).length > 0 && (
              <IconButton
                label="Pick callout"
                onClick={() => onPicker({ card, kind, index })}
              >
                <Crop />
              </IconButton>
            )}
            <IconButton
              label={`Open ${pretty(card.feature)} in image viewer`}
              onClick={open}
              disabled={source === "exported" && failed}
            >
              <Maximize2 />
            </IconButton>
          </div>
        </div>
        <div className="flex min-h-6 flex-wrap gap-1">
          {source === "exported" ? (
            <Status tone={failed ? "warning" : "muted"}>
              {failed ? "Not exported" : "Exported"}
            </Status>
          ) : timeout ? (
            <Status tone="danger">Preview unavailable</Status>
          ) : !report ? (
            <span className="text-xs text-muted-foreground">
              Loading preview…
            </span>
          ) : (
            <>
              {report.missingCopy?.length > 0 && (
                <Status tone="warning">Copy needed</Status>
              )}
              {report.fallbackCaptures?.length > 0 && (
                <Status tone="warning">{model.reference} capture</Status>
              )}
              {report.fixedCallouts?.length > 0 && (
                <Status tone="warning">Check callout</Status>
              )}
              {report.fit === 0 && <Status tone="danger">Copy too long</Status>}
              {!warnings && <Status tone="success">Preview ready</Status>}
              {report.fit > 0 && report.fit < 1 && (
                <Status>Fitted {Math.round(report.fit * 100)}%</Status>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
export function GalleryStrip({
  model,
  locale,
  kind,
  cards,
  height,
  source,
  joined,
  onPicker,
  compact = false,
}) {
  const viewerItems = useMemo(
    () => artworkMedia(model, locale, kind, cards, source),
    [model.base, model.revision, locale, kind, cards, source],
  );
  const scroll = useRef(null),
    [range, setRange] = useState(""),
    [edges, setEdges] = useState([true, true]);
  const update = () => {
    const viewport = scroll.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport?.clientWidth) return;
    setEdges([
      viewport.scrollLeft < 2,
      viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2,
    ]);
    const bound = viewport.getBoundingClientRect(),
      visible = [...viewport.querySelectorAll(".screenshot-card")]
        .map((el, i) => {
          const b = el.getBoundingClientRect();
          return b.right > bound.left + 20 && b.left < bound.right - 20
            ? i + 1
            : null;
        })
        .filter(Boolean);
    setRange(
      visible.length
        ? `${visible[0]}${visible.at(-1) !== visible[0] ? `–${visible.at(-1)}` : ""} / ${cards.length}`
        : `0 / ${cards.length}`,
    );
  };
  useEffect(() => {
    const viewport = scroll.current?.querySelector(
        '[data-slot="scroll-area-viewport"]',
      ),
      observer = new ResizeObserver(update);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, [height, cards.length]);
  const move = (direction) => {
    const viewport = scroll.current.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport.scrollBy({
      left: direction * viewport.clientWidth * 0.85,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <Card
      className="canvas-surface gap-0 overflow-hidden bg-muted/30 py-0 shadow-none"
      data-joined={joined}
      data-preview-source={source}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {model.profiles[kind].label || pretty(kind)}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {model.profiles[kind].width} × {model.profiles[kind].height}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground tabular-nums">
            {range}
          </span>
          <IconButton
            label="Previous screenshot cards"
            disabled={edges[0]}
            onClick={() => move(-1)}
          >
            <ArrowLeft />
          </IconButton>
          <IconButton
            label="Next screenshot cards"
            disabled={edges[1]}
            onClick={() => move(1)}
          >
            <ArrowRight />
          </IconButton>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 p-0">
        <ScrollArea
          ref={scroll}
          type="auto"
          className="gallery-scroll w-full"
          onScrollCapture={update}
          role="region"
          aria-label={
            compact
              ? `${language(locale)} screenshot cards`
              : "Screenshot cards"
          }
          tabIndex={0}
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              move(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div
            className={`flex w-max items-start p-5 ${joined ? "gap-0" : "gap-4"}`}
          >
            {cards.map((card, index) => (
              <PreviewCard
                key={`${index}-${model.revision}`}
                {...{
                  model,
                  locale,
                  kind,
                  card,
                  index,
                  height,
                  source,
                  onPicker,
                  viewerItems,
                }}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
