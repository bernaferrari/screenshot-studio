import { Image, Link2, Monitor, Smartphone, Store, Tablet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Choice } from "@/components/common";
import { language, plural } from "@/lib/format";
import { cardsFor, type ProjectModel } from "@/lib/project";
import type { Route } from "@/lib/route";

const galleryIcon = (kind: string) =>
  kind === "phone"
    ? Smartphone
    : kind === "desktop"
      ? Monitor
      : kind.startsWith("tablet")
        ? Tablet
        : Image;

/** Which gallery, language and source to show, and how: store page, joined, preview size. */
export function GalleryToolbar({
  model,
  route,
  kind,
  locale,
  label,
  height,
  onHeight,
}: {
  model: ProjectModel;
  route: Route;
  kind: string;
  locale: string;
  /** A gallery's name. */
  label(kind: string): string;
  height: number;
  onHeight(height: number): void;
}) {
  const kinds = Object.keys(model.galleries),
    chooseKind = (next: string) => route.go({ kind: next, card: null });
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Tabs
        value={kind}
        onValueChange={(next) => {
          if (next) chooseKind(next);
        }}
        className="hidden min-w-0 @min-[56rem]/gallery:flex"
      >
        <ScrollArea className="w-full">
          <TabsList
            activateOnFocus={false}
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
            onChange={chooseKind}
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
          onValueChange={(source) => {
            if (source) route.go({ source });
          }}
        >
          <TabsList activateOnFocus={false} aria-label="Preview source">
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
                onValueChange={(next) => {
                  const value = Array.isArray(next) ? next[0] : next;
                  if (value != null) onHeight(value);
                }}
              />
              <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                {height} px
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
