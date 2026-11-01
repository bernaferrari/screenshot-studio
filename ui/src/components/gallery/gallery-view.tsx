import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Link2, Monitor, Smartphone, Store, Tablet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { CalloutPicker } from "@/components/callout-picker";
import { Choice, EmptyState } from "@/components/common";
import { artworkMedia, useMediaViewer } from "@/components/media-viewer";
import { language, plural, pretty } from "@/lib/format";
import { typing, useMediaQuery, useStoredNumber } from "@/lib/hooks";
import {
  cardsFor,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import { cardIssues } from "@/lib/review";
import type { Route, Source } from "@/lib/route";
import type { ReviewIssue, StudioProject } from "@/lib/types";
import type { FrameState } from "./card-frame";
import { frameKey, GalleryStrip } from "./gallery-strip";
import { Inspector } from "./inspector";
import { StorePreview } from "./store-preview";

const galleryIcon = (kind: string) =>
  kind === "phone"
    ? Smartphone
    : kind === "desktop"
      ? Monitor
      : kind.startsWith("tablet")
        ? Tablet
        : Image;

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
  const kinds = Object.keys(model.galleries),
    kind = route.kind && model.galleries[route.kind] ? route.kind : kinds[0],
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
    strips = useRef(
      new Map<string, { kind: string; locale: string; source: Source }>(),
    ),
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
  const move = useCallback(
    (direction: number) => {
      if (card === null) return;
      const next = card + direction;
      if (next >= 0 && next < cards.length) select(next);
    },
    [card, cards.length, select],
  );

  // Escape closes the inspector; ← and → move between cards, unless typing or a dialog is open.
  useEffect(() => {
    if (card === null || !active) return;
    const keys = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        typing(event) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"]:not(.inspector-sheet), [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      if (event.key === "Escape") select(null);
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else return;
      event.preventDefault();
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [card, active, move, select]);

  if (!kind)
    return (
      <EmptyState
        icon={Image}
        title="No galleries yet"
        description="Add a gallery to gallery.json (and its size to profiles.json); its cards appear here as soon as the file is saved."
      />
    );

  const stripKey = JSON.stringify([kind, locale, route.source]);
  if (!strips.current.has(stripKey))
    strips.current.set(stripKey, { kind, locale, source: route.source });
  while (strips.current.size > KEPT_STRIPS) {
    const oldest = strips.current.keys().next().value!;
    if (oldest === stripKey) break;
    strips.current.delete(oldest);
  }
  // A gallery removed from gallery.json leaves with its strips.
  for (const [key, strip] of strips.current)
    if (!model.galleries[strip.kind] || !model.locales.includes(strip.locale))
      strips.current.delete(key);

  const profile = model.profiles[kind],
    label = (type: string) => model.profiles[type]?.label || pretty(type),
    inspecting = card !== null,
    cardState =
      card === null ? undefined : states.get(frameKey(locale, kind, card));
  const inspector =
    card !== null ? (
      <Inspector
        session={session}
        model={model}
        kind={kind}
        index={card}
        locale={locale}
        state={cardState}
        issues={cardIssues(issues, kind, card, locale)}
        onClose={() => select(null)}
        onMove={move}
        onPicker={() => setPicker({ kind, index: card })}
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
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <Tabs
          value={kind}
          activationMode="manual"
          onValueChange={(next) => route.go({ kind: next, card: null })}
          className="hidden min-w-0 @min-[56rem]/gallery:flex"
        >
          <ScrollArea className="w-full" type="auto">
            <TabsList
              aria-label="Device galleries"
              variant="line"
              className="h-auto w-max min-w-full justify-start gap-1 rounded-none border-b px-3 py-2"
            >
              {kinds.map((type) => {
                const Icon = galleryIcon(type);
                return (
                  <TabsTrigger
                    key={type}
                    value={type}
                    className="h-9 flex-none gap-2 px-3"
                  >
                    <Icon />
                    {label(type)}
                    <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                      {cardsFor(model.galleries, type).length}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Tabs>
        <CardContent className="flex flex-wrap items-center gap-2.5 p-3">
          <div className="w-full @min-[56rem]/gallery:hidden">
            <Choice
              label="Device gallery"
              value={kind}
              onChange={(next) => route.go({ kind: next, card: null })}
              items={kinds.map((type) => ({
                value: type,
                label: `${label(type)} · ${plural(cardsFor(model.galleries, type).length, "card")}`,
              }))}
              className="w-full"
            />
          </div>
          <Choice
            label="Language"
            value={locale}
            onChange={(next) => route.go({ locale: next })}
            items={model.locales.map((code) => ({
              value: code,
              label: `${language(code)}${code === model.reference ? " · reference" : ""}`,
            }))}
            className="w-full sm:w-64"
          />
          <Tabs
            value={route.source}
            activationMode="manual"
            onValueChange={(source) => route.go({ source })}
          >
            <TabsList aria-label="Preview source">
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="exported">Exported</TabsTrigger>
            </TabsList>
          </Tabs>
          <Toggle
            pressed={route.store}
            onPressedChange={(store) =>
              route.go({ store: store || null }, { replace: true })
            }
            aria-label="Store preview"
            variant="outline"
          >
            <Store />
            Store preview
          </Toggle>
          {!route.store && (
            <>
              <Toggle
                pressed={route.joined}
                onPressedChange={(joined) =>
                  route.go({ joined }, { replace: true })
                }
                aria-label="Joined"
                variant="outline"
              >
                <Link2 />
                Joined
              </Toggle>
              <div className="ml-auto flex items-center gap-3">
                <Label htmlFor="preview-height" className="sr-only">
                  Preview size
                </Label>
                <Slider
                  id="preview-height"
                  aria-label="Preview size"
                  value={[height]}
                  min={240}
                  max={760}
                  step={20}
                  className="w-28"
                  onValueChange={([next]) => setHeight(next)}
                />
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {height} px
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
              onSelect={(index) => select(index === card ? null : index)}
              onKind={(next) => route.go({ kind: next, card: null })}
            />
          ) : (
            <div id="view">
              {[...strips.current].map(([key, strip]) => {
                const stripCards = cardsFor(model.galleries, strip.kind),
                  current = key === stripKey;
                return (
                  <div
                    key={key}
                    className="editor-view"
                    hidden={!current}
                    inert={!current || undefined}
                  >
                    {stripCards.length ? (
                      <GalleryStrip
                        model={model}
                        locale={strip.locale}
                        kind={strip.kind}
                        cards={stripCards}
                        height={height}
                        source={strip.source}
                        joined={route.joined}
                        revision={session.revision(strip.locale)}
                        exportRevision={session.exportRevision(strip.locale)}
                        selected={current ? card : null}
                        onSelect={(index) =>
                          select(index === card ? null : index)
                        }
                        onPicker={(index) =>
                          setPicker({ kind: strip.kind, index })
                        }
                        onState={onState}
                        states={states}
                      />
                    ) : (
                      <EmptyState
                        title="No cards in this gallery"
                        description={`Add cards to "${strip.kind}" in gallery.json; they appear here as soon as the file is saved.`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
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
          onOpenChange={(open) => !open && select(null)}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className="inspector-sheet w-full gap-0 p-0 sm:max-w-md"
            onOpenAutoFocus={(event) => event.preventDefault()}
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
