import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crop, Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { IconButton, Status } from "@/components/common";
import { artworkMedia, useMediaViewer } from "@/components/media-viewer";
import { language, position, pretty } from "@/lib/format";
import { devicesFor, type ProjectModel } from "@/lib/project";
import type { Source } from "@/lib/route";
import type { Card as GalleryCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardFrame, type FrameState } from "./card-frame";

/** What the strip's cards report, by `${locale}|${kind}|${index}`. */
export type FrameStates = ReadonlyMap<string, FrameState>;
export const frameKey = (locale: string, kind: string, index: number) =>
  `${locale}|${kind}|${index}`;

interface StripProps {
  model: ProjectModel;
  locale: string;
  kind: string;
  cards: GalleryCard[];
  height: number;
  source: Source;
  joined: boolean;
  revision: string;
  exportRevision: number;
  selected: number | null;
  onSelect(index: number): void;
  onPicker(index: number): void;
  onState(key: string, state: FrameState): void;
  states: FrameStates;
}

const smooth = (): ScrollBehavior =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";

/** A gallery's cards side by side, as the store carousel shows them. Clicking a card inspects it. */
export function GalleryStrip(props: StripProps) {
  const { model, locale, kind, cards, height, source, joined, selected } =
    props;
  const scroll = useRef<HTMLDivElement>(null),
    [range, setRange] = useState(""),
    [edges, setEdges] = useState<[boolean, boolean]>([true, true]);
  const viewport = () =>
    scroll.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    ) || null;
  const update = useCallback(() => {
    const node = viewport();
    if (!node?.clientWidth) return;
    setEdges([
      node.scrollLeft < 2,
      node.scrollLeft >= node.scrollWidth - node.clientWidth - 2,
    ]);
    const bound = node.getBoundingClientRect(),
      visible = [...node.querySelectorAll(".screenshot-card")]
        .map((el, i) => {
          const b = el.getBoundingClientRect();
          return b.right > bound.left + 20 && b.left < bound.right - 20
            ? i + 1
            : 0;
        })
        .filter(Boolean);
    setRange(
      visible.length
        ? `${visible[0]}${visible.at(-1) !== visible[0] ? `–${visible.at(-1)}` : ""} / ${cards.length}`
        : `0 / ${cards.length}`,
    );
  }, [cards.length]);
  useEffect(() => {
    const node = viewport(),
      observer = new ResizeObserver(update);
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [height, update]);
  // Keep the inspected card in view.
  useEffect(() => {
    if (selected === null) return;
    // Scroll the strip only, never the page.
    const strip = viewport(),
      node = strip?.querySelectorAll<HTMLElement>(".screenshot-card")[selected];
    if (!strip || !node) return;
    const bounds = strip.getBoundingClientRect(),
      box = node.getBoundingClientRect();
    if (box.left < bounds.left)
      strip.scrollBy({ left: box.left - bounds.left - 20, behavior: smooth() });
    else if (box.right > bounds.right)
      strip.scrollBy({
        left: box.right - bounds.right + 20,
        behavior: smooth(),
      });
  }, [selected]);
  const move = (direction: number) => {
    const node = viewport();
    node?.scrollBy({
      left: direction * node.clientWidth * 0.85,
      behavior: smooth(),
    });
  };
  const label = model.profiles[kind].label || pretty(kind);
  return (
    <Card
      className="canvas-surface gap-0 overflow-hidden bg-muted/30 py-0 shadow-none"
      data-joined={joined}
      data-preview-source={source}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{label}</span>
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
            {model.profiles[kind].width} × {model.profiles[kind].height} ·{" "}
            {language(locale)}
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
          aria-label={`${label} screenshot cards`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              move(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <div
            className={cn(
              "flex w-max items-start p-5",
              joined ? "gap-0" : "gap-4",
            )}
          >
            {cards.map((card, index) => (
              <PreviewCard key={index} {...props} card={card} index={index} />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

const PreviewCard = memo(function PreviewCard({
  model,
  locale,
  kind,
  cards,
  card,
  index,
  height,
  source,
  revision,
  exportRevision,
  selected,
  onSelect,
  onPicker,
  onState,
  states,
}: StripProps & { card: GalleryCard; index: number }) {
  const openViewer = useMediaViewer();
  const key = frameKey(locale, kind, index),
    state = states.get(key),
    width = (height * model.profiles[kind].width) / model.profiles[kind].height,
    name = pretty(card.feature),
    active = selected === index;
  const view = (event: React.MouseEvent) =>
    openViewer(
      {
        items: artworkMedia(model, locale, kind, cards, { source, revision }),
        index,
        title: `${model.config.app || "Screenshots"} · ${model.profiles[kind].label || pretty(kind)}`,
      },
      event.currentTarget,
    );
  const report = state?.status === "ready" ? state.report : null;
  const problems = report
    ? [
        report.missingCopy?.length ? (
          <Status key="copy" tone="warning">
            Copy needed
          </Status>
        ) : null,
        report.fallbackCaptures?.length ? (
          <Status key="capture" tone="warning">
            {model.reference} capture
          </Status>
        ) : null,
        report.fixedCallouts?.length ? (
          <Status key="callout" tone="warning">
            Check callout
          </Status>
        ) : null,
        report.fit === 0 ? (
          <Status key="fit" tone="danger">
            Copy too long
          </Status>
        ) : null,
      ].filter(Boolean)
    : [];
  return (
    <div
      className="screenshot-card shrink-0"
      style={{ width }}
      data-selected={active || undefined}
    >
      <button
        type="button"
        aria-label={`Inspect ${name}`}
        aria-pressed={active}
        onClick={() => onSelect(index)}
        className={cn(
          "frame relative block cursor-pointer rounded-md shadow-sm outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/60",
          active
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : "hover:ring-2 hover:ring-ring/40",
        )}
      >
        <CardFrame
          {...{
            model,
            locale,
            kind,
            card,
            index,
            height,
            source,
            revision,
            exportRevision,
          }}
          className="border"
          onState={(next) => onState(key, next)}
        />
      </button>
      <div className="space-y-2 px-1 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {position(index)}
          </span>
          <span className="truncate font-medium">{name}</span>
          <div className="ml-auto flex">
            {devicesFor(card).length > 0 && (
              <IconButton label="Pick callout" onClick={() => onPicker(index)}>
                <Crop />
              </IconButton>
            )}
            <IconButton
              label={`Open ${name} in image viewer`}
              onClick={view}
              disabled={source === "exported" && state?.status === "missing"}
            >
              <Maximize2 />
            </IconButton>
          </div>
        </div>
        <div className="flex min-h-6 flex-wrap gap-1">
          {source === "exported" ? (
            <Status tone={state?.status === "missing" ? "warning" : "muted"}>
              {state?.status === "missing" ? "Not exported" : "Exported"}
            </Status>
          ) : state?.status === "failed" ? (
            <Status tone="danger">Preview unavailable</Status>
          ) : !report ? (
            <span className="text-xs text-muted-foreground">Rendering…</span>
          ) : problems.length ? (
            problems
          ) : (
            <Status tone="success">Preview ready</Status>
          )}
          {report && report.fit > 0 && report.fit < 1 && (
            <Status>Fitted {Math.round(report.fit * 100)}%</Status>
          )}
        </div>
      </div>
    </div>
  );
});
