import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Globe2,
  Image,
  Languages,
  Layers,
  Monitor,
  Smartphone,
  Square,
  Tablet,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Metrics,
  Filmstrip,
  Status,
  SearchField,
  Choice,
  EmptyState,
} from "./common";
import { editorURL, language } from "@/lib/model";
const nextNames = {
  copy: "Copy needed",
  capture: "Captures needed",
  layout: "Layout maps needed",
  export: "Exports needed",
  cards: "No cards yet",
  review: "Complete assets",
};
const galleryIcon = (kind) =>
  kind === "phone"
    ? Smartphone
    : kind === "desktop"
      ? Monitor
      : kind.startsWith("tablet")
        ? Tablet
        : kind === "icon"
          ? Square
          : Image;
function GalleryLinks({ project }) {
  return (
    <div className="grid gap-3 @min-[30rem]/project:grid-cols-2 @min-[65rem]/project:grid-cols-3">
      {project.galleries.map((g) => {
        const Icon = galleryIcon(g.kind);
        return (
          <Card key={g.kind} className="gap-4 py-5 shadow-none">
            <CardHeader className="gap-3 px-5">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg border bg-muted/40">
                  <Icon className="size-5 text-muted-foreground" />
                </span>
                <Badge variant="secondary">
                  {g.cards} {g.cards === 1 ? "card" : "cards"}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-sm">{g.label}</CardTitle>
                <CardDescription className="text-xs tabular-nums">
                  {g.width.toLocaleString()} × {g.height.toLocaleString()} px
                </CardDescription>
              </div>
            </CardHeader>
            <CardFooter className="mt-auto px-5">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full justify-between"
              >
                <Link
                  to={editorURL(project, "cards", project.reference, g.kind)}
                >
                  Open gallery
                  <ArrowRight />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
function coverageCounts(locale) {
  return [
    [locale.translated, locale.fields, "Copy"],
    [locale.captures, locale.expectedCaptures, "Captures"],
    [locale.layouts, locale.expectedCaptures, "Layout maps"],
    [locale.exports, locale.expectedExports, "Exports"],
  ];
}
function LanguageCoverage({ project }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const locales = project.locales
    .filter((l) =>
      `${language(l.locale)} ${l.locale}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .filter(
      (l) =>
        filter === "all" ||
        (filter === "unfinished" ? !l.complete : l.complete),
    );
  const action = (l) => (
    <Button asChild variant="outline" size="sm">
      <Link
        to={editorURL(project, l.next === "copy" ? "copy" : "cards", l.locale)}
      >
        {l.next === "copy" ? "Edit copy" : "Review"}
        <ArrowRight />
      </Link>
    </Button>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 @min-[36rem]/project:flex-row @min-[36rem]/project:items-center">
        <div className="flex-1">
          <SearchField
            label="Search project languages"
            value={query}
            onChange={setQuery}
            placeholder="Search languages…"
          />
        </div>
        <Choice
          label="Language asset status"
          value={filter}
          onChange={setFilter}
          className="w-full @min-[36rem]/project:w-48"
          items={[
            { value: "all", label: "All asset sets" },
            { value: "unfinished", label: "Needs work" },
            { value: "complete", label: "Assets complete" },
          ]}
        />
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {locales.length} of {project.locales.length} languages · saved files on
        disk
      </p>
      {locales.length ? (
        <>
          <Card className="hidden overflow-hidden py-0 shadow-none @min-[56rem]/project:block">
            <Table className="workspace-table">
              <TableHeader className="bg-muted/40 [&_th]:text-xs [&_th]:text-muted-foreground">
                <TableRow>
                  {[
                    "Language",
                    "Status",
                    "Copy",
                    "Captures",
                    "Layout maps",
                    "Exports",
                    "Actions",
                  ].map((text, i) => (
                    <TableHead
                      key={text}
                      className={i >= 2 && i <= 5 ? "text-right" : undefined}
                    >
                      {text === "Actions" ? (
                        <span className="sr-only">Actions</span>
                      ) : (
                        text
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {locales.map((l) => (
                  <TableRow key={l.locale}>
                    <TableCell>
                      <span className="font-medium">{language(l.locale)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {l.locale}
                        {l.locale === project.reference ? " · reference" : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Status tone={l.complete ? "success" : "muted"}>
                        {nextNames[l.next]}
                      </Status>
                    </TableCell>
                    {coverageCounts(l).map(([n, total, label]) => (
                      <TableCell
                        key={label}
                        className="text-right tabular-nums"
                      >
                        {n}
                        <span className="text-muted-foreground">
                          {" "}
                          / {total}
                        </span>
                      </TableCell>
                    ))}
                    <TableCell className="text-right">{action(l)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="grid gap-3 @min-[34rem]/project:grid-cols-2 @min-[56rem]/project:hidden">
            {locales.map((l) => (
              <Card
                key={l.locale}
                role="article"
                aria-label={`${language(l.locale)} asset set`}
                className="project-language-card gap-4 py-4 shadow-none"
              >
                <CardHeader className="gap-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm leading-normal">
                        {language(l.locale)}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        {l.locale}
                        {l.locale === project.reference ? " · reference" : ""}
                      </CardDescription>
                    </div>
                    <Status tone={l.complete ? "success" : "muted"}>
                      {nextNames[l.next]}
                    </Status>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 px-4">
                  {coverageCounts(l).map(([n, total, label]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-1 text-xs"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums">
                        {n}
                        <span className="text-muted-foreground">
                          {" "}
                          / {total}
                        </span>
                      </span>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="justify-end border-t px-4 pt-3">
                  {action(l)}
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="No matching languages"
          description="Try a different language or asset status."
          icon={Globe2}
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
        Complete asset sets have copy, captures, layout maps and exports
        present. Review the artwork and run strict export before publishing.
      </p>
    </div>
  );
}
export function StudioProjectOverview({ project }) {
  const [params, setParams] = useSearchParams();
  const section = ["galleries", "languages"].includes(params.get("section"))
    ? params.get("section")
    : "overview";
  const select = (next) =>
    setParams(
      (old) => {
        const q = new URLSearchParams(old);
        if (next === "overview") q.delete("section");
        else q.set("section", next);
        return q;
      },
      { preventScrollReset: true },
    );
  const pending = project.locales.find((l) => !l.complete);
  const next =
    pending ||
    project.locales.find((l) => l.locale === project.reference) ||
    project.locales[0];
  const nextCopy = next?.next === "copy";
  const message = nextCopy
    ? `${language(next.locale)} has ${next.fields - next.translated} copy fields to finish.`
    : next?.next === "capture"
      ? `${language(next.locale)} needs ${next.expectedCaptures - next.captures} captures.`
      : next?.next === "layout"
        ? `${language(next.locale)} needs ${next.expectedCaptures - next.layouts} layout maps.`
        : next?.next === "export"
          ? `${language(next.locale)} needs ${next.expectedExports - next.exports} exports.`
          : next?.next === "cards"
            ? "Add screenshot cards to start building this listing."
            : "Your assets are in place. Review the artwork before publishing.";
  return (
    <Tabs
      value={section}
      activationMode="manual"
      onValueChange={select}
      className="@container/project gap-6"
    >
      <TabsList
        aria-label="Project sections"
        variant="line"
        className="h-auto w-full justify-start gap-3 rounded-none border-b px-0 pb-2"
      >
        {[
          ["overview", "Overview", Layers],
          ["galleries", "Galleries", Image],
          ["languages", "Languages", Languages],
        ].map(([value, label, Icon]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="min-h-10 flex-none gap-2 px-2 text-xs sm:text-sm"
          >
            <Icon className="hidden size-4 min-[360px]:block" />
            {label}
            {value !== "overview" && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {value === "galleries"
                  ? project.galleries.length
                  : project.locales.length}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="overview" className="mt-0 space-y-6">
        <Metrics
          items={[
            [
              project.cardCount,
              "Screenshot cards",
              `${project.galleries.length} device galleries`,
            ],
            [
              `${project.completeLocales} / ${project.locales.length}`,
              "Complete asset sets",
              "Copy, captures, maps and exports",
            ],
            [
              `${project.totals.captures} / ${project.totals.expectedCaptures}`,
              "Captures present",
              `${project.totals.layouts} layout maps present`,
            ],
            [
              `${project.totals.exports} / ${project.totals.expectedExports}`,
              "Exports present",
              "Expected files in your listing",
            ],
          ]}
        />
        {next && (
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="flex flex-col gap-4 p-4 @min-[40rem]/project:flex-row @min-[40rem]/project:items-center @min-[40rem]/project:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  {nextCopy ? (
                    <Type className="size-4" />
                  ) : (
                    <Layers className="size-4" />
                  )}
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {pending ? "Next step" : "Ready for review"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {message}
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="self-start @min-[40rem]/project:shrink-0"
              >
                <Link
                  to={editorURL(
                    project,
                    nextCopy ? "copy" : "cards",
                    next.locale,
                  )}
                >
                  {nextCopy ? "Continue translation" : "Review artwork"}
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Screenshots</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => select("galleries")}
            >
              Browse galleries
              <ArrowRight />
            </Button>
          </div>
          <Card className="overflow-hidden p-0 shadow-none">
            <Filmstrip project={project} large />
          </Card>
        </section>
        <div className="grid gap-3 @min-[34rem]/project:grid-cols-2">
          {[
            [
              "galleries",
              "Device galleries",
              `${project.galleries.length} sizes, from screenshots to store assets`,
              Image,
            ],
            [
              "languages",
              "Language coverage",
              project.completeLocales === project.locales.length
                ? "All language asset sets are complete"
                : `${project.locales.length - project.completeLocales} asset sets still need work`,
              Globe2,
            ],
          ].map(([value, title, hint, Icon]) => (
            <Card key={value} className="gap-0 py-0 shadow-none">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {title}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => select(value)}
                >
                  View {value}
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="galleries" className="mt-0 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Choose a gallery</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review artwork at its intended size.
          </p>
        </div>
        <GalleryLinks project={project} />
      </TabsContent>
      <TabsContent value="languages" className="mt-0 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Language coverage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See what each language needs next.
          </p>
        </div>
        <LanguageCoverage key={project.id} project={project} />
      </TabsContent>
    </Tabs>
  );
}
