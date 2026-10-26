import { useRef, useState } from "react";
import {
  Image,
  Languages,
  Type,
  Smartphone,
  Tablet,
  Monitor,
  Layers,
  ArrowRight,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { PageHeading, Choice, ErrorNotice, EmptyState } from "./common";
import { GalleryStrip } from "./preview";
import { LanguagesView } from "./languages";
import { CopyEditor } from "./copy-editor";
import { CalloutPicker } from "./callout-picker";
import { useProject, cardsFor, coverage, language, pretty } from "@/lib/model";
const viewInfo = {
  cards: [
    "Store artwork",
    "Screenshot gallery",
    "Compose a story that looks good from every angle.",
  ],
  languages: [
    "Localization",
    "Languages",
    "Find unfinished copy, check capture coverage and preview each language.",
  ],
  copy: [
    "Words & details",
    "Copy editor",
    "Edit your words, then save to refresh the artwork.",
  ],
};
export function Workbench({ route, summary, onSaved }) {
  const session = useProject(route.base),
    { model, error } = session,
    [height, setHeight] = useState(() => {
      try {
        const n = Number(localStorage.getItem("studio-preview-height"));
        return n >= 240 && n <= 760 ? n : 440;
      } catch {
        return 440;
      }
    }),
    [picker, setPicker] = useState(null),
    seen = useRef(new Map()),
    expanded = useRef(new Set());
  if (error)
    return <ErrorNotice message={error} title="This project could not open" />;
  if (!model)
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  const kind = model.galleries[route.kind]
      ? route.kind
      : Object.keys(model.galleries)[0],
    locale = model.locales.includes(route.locale)
      ? route.locale
      : model.reference,
    cards = cardsFor(model.galleries, kind),
    info = viewInfo[route.view],
    unfinished = model.locales.find((code) => {
      const c = coverage(model, code);
      return c.translated < c.total;
    });
  const key =
    route.view === "copy"
      ? JSON.stringify(["copy", locale])
      : JSON.stringify([
          route.view,
          kind,
          locale,
          route.source,
          model.revision,
        ]);
  if (!seen.current.has(key)) {
    seen.current.set(key, {
      view: route.view,
      kind,
      locale,
      source: route.source,
      revision: model.revision,
    });
  }
  for (const [old, entry] of seen.current)
    if (entry.view !== "copy" && entry.revision !== model.revision)
      seen.current.delete(old);
  while (seen.current.size > 6) {
    const oldest = seen.current.keys().next().value;
    if (oldest === key) break;
    seen.current.delete(oldest);
  }
  const DeviceIcon = (type) =>
    type === "phone"
      ? Smartphone
      : type === "desktop"
        ? Monitor
        : type.startsWith("tablet")
          ? Tablet
          : Image;
  return (
    <div className="@container/workbench space-y-6">
      <Tabs
        value={route.view}
        activationMode="manual"
        onValueChange={(view) => route.go({ view })}
        className="md:hidden"
      >
        <TabsList className="w-full">
          <TabsTrigger value="cards" className="flex-1">
            <Image />
            Cards
          </TabsTrigger>
          <TabsTrigger value="languages" className="flex-1">
            <Languages />
            Languages
          </TabsTrigger>
          <TabsTrigger value="copy" className="flex-1">
            <Type />
            Copy
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <PageHeading
        eyebrow={info[0]}
        title={info[1]}
        description={info[2]}
        actions={
          route.view !== "copy" && (
            <Button
              onClick={() =>
                route.go({
                  view: "copy",
                  locale:
                    route.view === "languages" ? unfinished || locale : locale,
                })
              }
            >
              <Type />
              {route.view === "languages"
                ? unfinished
                  ? "Continue translation"
                  : "Review copy"
                : "Edit copy"}
              <ArrowRight />
            </Button>
          )
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        {route.view !== "copy" && (
          <Tabs
            value={kind}
            activationMode="manual"
            onValueChange={(kind) => route.go({ kind })}
            className="hidden min-w-0 @min-[56rem]/workbench:flex"
          >
            <ScrollArea className="w-full" type="auto">
              <TabsList
                aria-label="Device galleries"
                variant="line"
                className="h-auto w-max min-w-full justify-start gap-1 rounded-none border-b px-3 py-2"
              >
                {Object.keys(model.galleries).map((type) => {
                  const Icon = DeviceIcon(type);
                  return (
                    <TabsTrigger
                      key={type}
                      value={type}
                      className="h-9 flex-none gap-2 px-3"
                    >
                      <Icon />
                      {model.profiles[type].label || pretty(type)}
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
        )}
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          {route.view !== "copy" && (
            <div className="w-full @min-[56rem]/workbench:hidden">
              <Choice
                label="Device gallery"
                value={kind}
                activationMode="manual"
                onChange={(kind) => route.go({ kind })}
                items={Object.keys(model.galleries).map((type) => ({
                  value: type,
                  label: `${model.profiles[type].label || pretty(type)} · ${cardsFor(model.galleries, type).length} cards`,
                }))}
                className="w-full"
              />
            </div>
          )}

          {route.view !== "languages" && (
            <Choice
              label="Language"
              value={locale}
              onChange={(locale) => route.go({ locale })}
              items={model.locales.map((code) => ({
                value: code,
                label: `${language(code)}${code === model.reference ? " · reference" : ""}`,
              }))}
              className="w-full sm:w-56"
            />
          )}
          {route.view === "copy" ? (
            <span className="text-xs text-muted-foreground sm:ml-auto">
              Copy for every device gallery
            </span>
          ) : (
            <>
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
                <Label htmlFor="height" className="sr-only">
                  Preview size
                </Label>
                <Slider
                  id="height"
                  aria-label="Preview size"
                  value={[height]}
                  min={240}
                  max={760}
                  step={20}
                  className="w-28"
                  onValueChange={([next]) => {
                    setHeight(next);
                    try {
                      localStorage.setItem("studio-preview-height", next);
                    } catch {}
                  }}
                />
                <span className="w-11 text-right text-xs text-muted-foreground tabular-nums">
                  {height} px
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div id="view">
        {[...seen.current].map(([entryKey, entry]) => (
          <div
            key={entryKey}
            className="editor-view"
            hidden={entryKey !== key}
            inert={entryKey !== key ? true : undefined}
          >
            {entry.view === "cards" ? (
              cardsFor(model.galleries, entry.kind).length ? (
                <GalleryStrip
                  {...{ model, height, onPicker: setPicker }}
                  locale={entry.locale}
                  kind={entry.kind}
                  cards={cardsFor(model.galleries, entry.kind)}
                  source={entry.source}
                  joined={route.joined}
                />
              ) : (
                <EmptyState
                  title="No cards in this gallery"
                  description="Choose another device gallery to review its artwork."
                />
              )
            ) : entry.view === "languages" ? (
              <LanguagesView
                {...{ model, height, go: route.go, summary, expanded }}
                locale={entry.locale}
                kind={entry.kind}
                cards={cardsFor(model.galleries, entry.kind)}
                source={entry.source}
                joined={route.joined}
              />
            ) : (
              <CopyEditor
                key={entry.locale}
                {...{ session, onSaved }}
                locale={entry.locale}
                kind={entry.kind}
              />
            )}
          </div>
        ))}
      </div>
      <p className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Real captures. Live artwork.</span>
        <span>
          {model.profiles[kind].width.toLocaleString()} ×{" "}
          {model.profiles[kind].height.toLocaleString()} px ·{" "}
          {model.locales.length} languages
        </span>
      </p>
      <CalloutPicker
        selection={picker}
        onClose={() => setPicker(null)}
        session={session}
      />
    </div>
  );
}
