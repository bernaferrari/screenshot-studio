import { useCallback, useRef, useState } from "react";
import { Image } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { CalloutPicker } from "@/components/callout/callout-picker";
import { EmptyState } from "@/components/common";
import { useMediaViewer } from "@/components/viewer/media-viewer";
import { plural, pretty } from "@/lib/format";
import { useMediaQuery, useStoredNumber } from "@/lib/hooks";
import { artworkMedia } from "@/lib/media";
import {
  cardsFor,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import { cardIssues } from "@/lib/review";
import type { Route } from "@/lib/route";
import { keepStrip, type Strip } from "@/lib/strips";
import type { ReviewIssue, StudioProject } from "@/lib/types";
import type { FrameState } from "./card-frame";
import { GalleryToolbar } from "./gallery-toolbar";
import { frameKey } from "./gallery-strip";
import { Inspector } from "./inspector/inspector";
import { KeptStrips } from "./kept-strips";
import { StorePreview } from "./store-preview";
import { useCardKeys } from "./use-card-keys";

/** Strips already rendered stay mounted (hidden), so going back to them doesn't render every card again. */
const KEPT_STRIPS = 6;

interface GalleryViewProps {
  session: ProjectSession;
  model: ProjectModel;
  route: Route;
  summary: StudioProject | undefined;
  issues: ReviewIssue[];
  /** False while another section is shown over the (still mounted) gallery. */
  active: boolean;
}

/** One gallery in one language, live or exported, as a strip of cards or a store page; click a card to inspect it. */
export function GalleryView({
  session,
  model,
  route,
  summary,
  issues,
  active,
}: GalleryViewProps) {
  const kind =
      route.kind && model.galleries[route.kind]
        ? route.kind
        : Object.keys(model.galleries)[0],
    locale =
      route.locale && model.locales.includes(route.locale)
        ? route.locale
        : model.reference,
    cards = kind ? cardsFor(model.galleries, kind) : [],
    card = route.card !== null && route.card < cards.length ? route.card : null,
    [height, setHeight] = useStoredNumber(
      "studio-preview-height",
      440,
      240,
      760,
    ),
    [states, setStates] = useState<ReadonlyMap<string, FrameState>>(new Map()),
    [picker, setPicker] = useState<{ kind: string; index: number } | null>(
      null,
    ),
    strips = useRef(new Map<string, Strip>()),
    wide = useMediaQuery("(min-width: 1280px)"),
    openViewer = useMediaViewer();

  const onState = useCallback(
    (key: string, state: FrameState) =>
      setStates((old) => new Map(old).set(key, state)),
    [],
  );
  const select = useCallback(
    (index: number | null) => route.go({ card: index }, { replace: true }),
    [route],
  );
  const close = useCallback(() => select(null), [select]);
  // Clicking the inspected card again closes the inspector.
  const toggle = useCallback(
    (index: number) => select(index === card ? null : index),
    [card, select],
  );
  const move = useCallback(
    (direction: number) => {
      if (card === null) return;
      const next = card + direction;
      if (next >= 0 && next < cards.length) select(next);
    },
    [card, cards.length, select],
  );
  const pick = useCallback(
    (kind: string, index: number) => setPicker({ kind, index }),
    [],
  );
  useCardKeys(card !== null && active, close, move);

  if (!kind)
    return (
      <EmptyState
        icon={Image}
        title="No galleries yet"
        description="Add a gallery to gallery.json (and its size to profiles.json); its cards appear here as soon as the file is saved."
      />
    );

  // This strip stays mounted with the last few shown; a gallery removed from gallery.json leaves with its strips.
  const current = keepStrip(
    strips.current,
    { kind, locale, source: route.source },
    (strip) =>
      !!model.galleries[strip.kind] && model.locales.includes(strip.locale),
    KEPT_STRIPS,
  );
  const profile = model.profiles[kind],
    label = (type: string) => model.profiles[type]?.label || pretty(type),
    inspecting = card !== null;
  const inspector =
    card !== null ? (
      <Inspector
        session={session}
        model={model}
        kind={kind}
        index={card}
        locale={locale}
        state={states.get(frameKey(locale, kind, card))}
        issues={cardIssues(issues, kind, card, locale)}
        onClose={close}
        onMove={move}
        onPicker={() => pick(kind, card)}
        onView={(event) =>
          openViewer(
            {
              items: artworkMedia(model, locale, kind, cards, {
                source: route.source,
                revision: session.revision(locale),
              }),
              index: card,
              title: `${model.config.app || "Screenshots"} · ${label(kind)}`,
            },
            event.currentTarget,
          )
        }
      />
    ) : null;

  return (
    <div className="@container/gallery space-y-4">
      <GalleryToolbar
        model={model}
        route={route}
        kind={kind}
        locale={locale}
        label={label}
        height={height}
        onHeight={setHeight}
      />
      <div
        className={
          inspecting && wide
            ? "grid grid-cols-[minmax(0,1fr)_minmax(340px,400px)] items-start gap-5"
            : undefined
        }
      >
        <div className="min-w-0 space-y-3">
          {route.store ? (
            <StorePreview
              model={model}
              kind={kind}
              locale={locale}
              source={route.source}
              icon={summary?.icon}
              revision={session.revision(locale)}
              exportRevision={session.exportRevision(locale)}
              storeTextRevision={session.storeTextRevision(locale)}
              selected={card}
              onSelect={toggle}
              onKind={(next) => route.go({ kind: next, card: null })}
            />
          ) : (
            <KeptStrips
              strips={strips.current}
              current={current}
              session={session}
              model={model}
              height={height}
              joined={route.joined}
              selected={card}
              onSelect={toggle}
              onPicker={pick}
              onState={onState}
              states={states}
            />
          )}
          <p className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {inspecting
                ? "← → move between cards · Esc closes the inspector"
                : "Click a card to inspect it. Real captures, live artwork."}
            </span>
            <span className="tabular-nums">
              {profile.width.toLocaleString()} ×{" "}
              {profile.height.toLocaleString()} px ·{" "}
              {plural(model.locales.length, "language")}
            </span>
          </p>
        </div>
        {inspecting && wide && (
          <aside
            aria-label="Card inspector"
            className="sticky top-[4.5rem] flex max-h-[calc(100dvh-5.5rem)] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            {inspector}
          </aside>
        )}
      </div>
      {!wide && (
        <Sheet
          open={inspecting && active}
          onOpenChange={(open) => !open && close()}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="inspector-sheet w-full gap-0 p-0 sm:max-w-md"
            initialFocus={false}
          >
            <SheetTitle className="sr-only">Card inspector</SheetTitle>
            <SheetDescription className="sr-only">
              The card's words, checks, captures and gallery.json entry.
            </SheetDescription>
            {inspector}
          </SheetContent>
        </Sheet>
      )}
      <CalloutPicker
        selection={
          picker
            ? {
                kind: picker.kind,
                index: picker.index,
                card: cardsFor(model.galleries, picker.kind)[picker.index],
              }
            : null
        }
        onClose={() => setPicker(null)}
        session={session}
        model={model}
      />
    </div>
  );
}
