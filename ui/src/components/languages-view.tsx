import { useState } from "react";
import { ArrowRight, Image, Languages, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, SearchField, Status, type Tone } from "./common";
import { language } from "@/lib/format";
import {
  copyCoverage,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Route } from "@/lib/route";
import type { LocaleCoverage, StudioProject } from "@/lib/types";

type Filter = "all" | "work" | "complete";
interface Row {
  locale: string;
  copy: { total: number; translated: number };
  saved: LocaleCoverage | undefined;
  status: [string, Tone];
  done: boolean;
}

const nextStep: Record<LocaleCoverage["next"], [string, Tone]> = {
  copy: ["Copy needed", "warning"],
  capture: ["Captures needed", "warning"],
  layout: ["Layout maps needed", "warning"],
  export: ["Export needed", "info"],
  review: ["Complete", "success"],
  cards: ["No cards yet", "muted"],
};

/** Every language with what it still needs: words (live, unsaved included), captures, layout maps and exports. */
export function LanguagesView({
  session,
  model,
  route,
  summary,
}: {
  session: ProjectSession;
  model: ProjectModel;
  route: Route;
  summary: StudioProject | undefined;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<Filter>("all");
  const rows: Row[] = model.locales.map((locale) => {
    const copy = copyCoverage(session.drafts, model.reference, locale, model),
      saved = summary?.locales.find((l) => l.locale === locale),
      copyDone = copy.translated === copy.total,
      status: [string, Tone] = !copyDone
        ? nextStep.copy
        : !saved
          ? ["Copy complete", "success"]
          : saved.next === "copy"
            ? ["Copy unsaved", "info"]
            : nextStep[saved.next];
    return {
      locale,
      copy,
      saved,
      status,
      done: copyDone && (saved ? saved.complete : true),
    };
  });
  const needle = query.toLowerCase(),
    visible = rows.filter(
      (row) =>
        `${language(row.locale)} ${row.locale}`
          .toLowerCase()
          .includes(needle) &&
        (filter === "all" || (filter === "work" ? !row.done : row.done)),
    ),
    unfinished = rows.find((row) => row.copy.translated < row.copy.total),
    copyComplete = rows.filter(
      (row) => row.copy.translated === row.copy.total,
    ).length;
  return (
    <div className="@container/languages space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {(
            [
              [model.locales.length, "Languages"],
              [copyComplete, "Copy complete"],
              [rows.filter((row) => row.done).length, "Ready to ship"],
            ] as const
          ).map(([n, label]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                {n}
              </dd>
            </div>
          ))}
        </dl>
        <Button
          onClick={() =>
            route.go({
              view: "copy",
              locale: unfinished?.locale || model.reference,
            })
          }
        >
          <Type />
          {unfinished ? "Continue translation" : "Review copy"}
          <ArrowRight />
        </Button>
      </div>
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as Filter)}
        className="gap-4"
      >
        <div className="flex flex-col gap-3 @min-[50rem]/languages:flex-row @min-[50rem]/languages:items-center">
          <TabsList
            aria-label="Language filters"
            className="h-auto w-full @min-[28rem]/languages:w-fit"
          >
            <TabsTrigger value="all" className="px-2 text-xs sm:text-sm">
              All languages
            </TabsTrigger>
            <TabsTrigger value="work" className="px-2 text-xs sm:text-sm">
              Needs work
            </TabsTrigger>
            <TabsTrigger value="complete" className="px-2 text-xs sm:text-sm">
              Complete
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
            className="text-xs text-muted-foreground @min-[50rem]/languages:ml-auto"
            role="status"
          >
            {visible.length} of {model.locales.length} languages
          </span>
        </div>
        <TabsContent keepMounted value={filter} className="mt-0">
          {visible.length ? (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {visible.map((row) => (
                <LanguageRow
                  key={row.locale}
                  row={row}
                  reference={model.reference}
                  route={route}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No matching languages"
              description="Try a language name or code, or clear the filter."
              icon={Languages}
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
        </TabsContent>
      </Tabs>
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Copy counts include unsaved words. Captures, layout maps and exports
        count the files on disk; a complete language still needs a look before
        publishing.
      </p>
    </div>
  );
}

function LanguageRow({
  row,
  reference,
  route,
}: {
  row: Row;
  reference: string;
  route: Route;
}) {
  const { locale, copy, saved, status } = row,
    name = language(locale);
  const counts: [string, number, number][] = saved
    ? [
        ["Captures", saved.captures, saved.expectedCaptures],
        // Only captures with callouts need a layout map.
        ...(saved.expectedLayouts ? [["Layout maps", saved.layouts, saved.expectedLayouts] as [string, number, number]] : []),
        ["Exports", saved.exports, saved.expectedExports],
      ]
    : [];
  return (
    <li
      className="language-row grid items-center gap-x-6 gap-y-3 p-4 @min-[52rem]/languages:grid-cols-[minmax(11rem,1fr)_8.5rem_11rem_minmax(13rem,1.2fr)_auto]"
      data-locale={locale}
      aria-label={name}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground"
        >
          {locale.split("-")[0].toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {locale}
            {locale === reference ? " · reference" : ""}
          </p>
        </div>
      </div>
      <div>
        <Status tone={status[1]}>
          {locale === reference && status[1] === "success"
            ? "Reference"
            : status[0]}
        </Status>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs tabular-nums">
          <span className="font-medium">
            {copy.translated} / {copy.total}
          </span>
          <span className="text-muted-foreground"> copy fields</span>
        </p>
        <Progress
          value={copy.total ? (copy.translated / copy.total) * 100 : 100}
          className="h-1"
          aria-label={`${name} copy`}
        />
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        {counts.map(([label, n, total]) => (
          <div key={label} className="flex gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              className={
                n < total
                  ? "font-medium text-amber-700 dark:text-amber-300"
                  : undefined
              }
            >
              {n}/{total}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 @min-[52rem]/languages:justify-end">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View ${name} gallery`}
          onClick={() => route.go({ view: "gallery", locale, card: null })}
        >
          <Image />
          Gallery
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Edit ${name} copy`}
          onClick={() => route.go({ view: "copy", locale })}
        >
          <Type />
          Edit copy
        </Button>
      </div>
    </li>
  );
}
