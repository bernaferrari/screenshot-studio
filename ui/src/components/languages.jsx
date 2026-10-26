import { useRef, useState } from "react";
import {
  ChevronDown,
  Layers,
  Check,
  Languages as LanguagesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { SearchField, Status, EmptyState } from "./common";
import { GalleryStrip } from "./preview";
import { coverage, language } from "@/lib/model";
export function LanguagesView({
  model,
  locale,
  kind,
  cards,
  height,
  source,
  joined,
  go,
  summary,
  expanded,
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [open, setOpen] = useState(() => new Set(expanded.current)),
    mounted = useRef(new Set(expanded.current));
  const ready = model.locales.filter((code) => {
      const c = coverage(model, code);
      return c.translated === c.total;
    }).length,
    visible = model.locales
      .filter((code) =>
        `${language(code)} ${code}`.toLowerCase().includes(query.toLowerCase()),
      )
      .filter((code) => {
        const c = coverage(model, code);
        return (
          filter === "all" ||
          (filter === "missing"
            ? c.translated < c.total
            : c.translated === c.total)
        );
      });
  return (
    <Tabs
      value={filter}
      onValueChange={setFilter}
      className="@container/languages gap-5"
    >
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="grid grid-cols-3 divide-x px-0 py-4">
          {[
            [model.locales.length, "Languages"],
            [ready, "Copy complete"],
            [model.locales.length - ready, "Need copy"],
          ].map(([n, label]) => (
            <div key={label} className="px-4 sm:px-6">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {n}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {label}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3 @min-[50rem]/languages:flex-row @min-[50rem]/languages:items-center">
        <TabsList
          aria-label="Language filters"
          className="h-auto w-full @min-[28rem]/languages:w-fit"
        >
          <TabsTrigger value="all" className="px-2 text-xs sm:text-sm">
            All languages
          </TabsTrigger>
          <TabsTrigger value="missing" className="px-2 text-xs sm:text-sm">
            Needs copy
          </TabsTrigger>
          <TabsTrigger value="complete" className="px-2 text-xs sm:text-sm">
            Copy complete
          </TabsTrigger>
        </TabsList>
        <div className="w-full @min-[50rem]/languages:max-w-xs">
          <SearchField
            label="Search languages"
            value={query}
            onChange={setQuery}
            placeholder="Find a language…"
          />
        </div>
        <span
          className="text-xs text-muted-foreground sm:ml-auto"
          role="status"
        >
          {visible.length} of {model.locales.length} languages
        </span>
      </div>
      <TabsContent forceMount value={filter} className="mt-0 space-y-3">
        {model.locales.map((code) => {
          const c = coverage(model, code),
            complete = c.translated === c.total,
            saved = summary?.locales?.find((l) => l.locale === code);
          return (
            <Collapsible
              key={code}
              open={open.has(code)}
              onOpenChange={(value) => {
                const next = new Set(open);
                value ? next.add(code) : next.delete(code);
                if (value) mounted.current.add(code);
                setOpen(next);
                expanded.current = next;
              }}
              hidden={!visible.includes(code)}
              className="language-row row overflow-hidden rounded-xl border bg-card shadow-xs"
              data-locale={code}
            >
              <div className="language-row-heading flex flex-wrap items-center gap-3 p-4 lg:flex-nowrap">
                <div className="flex min-w-40 flex-1 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground"
                  >
                    {code.split("-")[0].toUpperCase()}
                  </span>
                  <h3 className="text-sm font-medium">
                    {language(code)}
                    <small className="mt-1 block text-xs font-normal text-muted-foreground">
                      {code}
                    </small>
                  </h3>
                </div>
                <Status tone={complete ? "success" : "muted"}>
                  {code === model.reference
                    ? "Reference"
                    : complete
                      ? "Copy complete"
                      : "Needs copy"}
                </Status>
                <div className="w-full space-y-2 lg:w-44">
                  <p className="text-xs tabular-nums">
                    <span className="font-medium">
                      {c.translated} / {c.total}
                    </span>
                    <span className="text-muted-foreground"> copy fields</span>
                  </p>
                  <Progress
                    value={c.total ? (c.translated / c.total) * 100 : 100}
                    className="h-1"
                  />
                  {saved && (
                    <p className="flex gap-3 text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        {saved.captures} / {saved.expectedCaptures} captures
                      </span>
                      <span>
                        {saved.exports} / {saved.expectedExports} exports
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex w-full items-center gap-2 lg:w-auto">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex-1 lg:flex-none"
                      aria-label={`Preview ${language(code)}`}
                    >
                      <Layers />
                      Preview
                      <ChevronDown
                        className={open.has(code) ? "rotate-180" : ""}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <Button
                    variant="outline"
                    onClick={() => go({ view: "copy", locale: code })}
                    aria-label={`Edit ${language(code)} copy`}
                  >
                    Edit copy
                  </Button>
                </div>
              </div>
              <CollapsibleContent
                forceMount
                hidden={!open.has(code)}
                className="language-preview border-t"
              >
                {mounted.current.has(code) && (
                  <>
                    <p className="p-4 text-xs leading-relaxed text-muted-foreground">
                      {complete
                        ? "Review the selected device gallery before exporting."
                        : `Empty fields use ${language(model.reference)}. Missing captures borrow the reference; preview badges show each fallback.`}
                    </p>
                    <GalleryStrip
                      {...{ model, kind, cards, source, joined }}
                      locale={code}
                      height={Math.round(height * 0.55)}
                      compact
                    />
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </TabsContent>
      {!visible.length && (
        <EmptyState
          title="No matching languages"
          description="Try a language name or code, or clear the filter."
          icon={LanguagesIcon}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Copy covers every gallery. Capture and export counts use saved project
        files. Expand a language to inspect the selected device.
      </p>
    </Tabs>
  );
}
