import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileWarning,
  Info,
  Loader2,
  OctagonAlert,
  RefreshCw,
  Type,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorNotice } from "./common";
import { ago, language, plural, position, pretty } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProjectModel } from "@/lib/project";
import { issueCounts, type ReviewSession } from "@/lib/review";
import type { Route } from "@/lib/route";
import type { ReviewIssue } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "error" | "warning" | "info";
const levels = {
  error: { icon: OctagonAlert, color: "text-destructive", label: "Error" },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    label: "Warning",
  },
  info: { icon: Info, color: "text-sky-600 dark:text-sky-400", label: "Note" },
};

/** Everything to fix in the project: the file check, and what the last export noticed, each linked to its card. */
export function ReviewView({
  review: session,
  model,
  route,
}: {
  review: ReviewSession;
  model: ProjectModel;
  route: Route;
}) {
  const [filter, setFilter] = useState<Filter>("all"),
    now = useNow();
  const { review, error, loading, refresh } = session;
  if (error && !review)
    return <ErrorNotice title="The review could not run" message={error} />;
  if (!review)
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  const counts = issueCounts(review.issues),
    issues = review.issues.filter(
      (issue) => filter === "all" || issue.level === filter,
    ),
    groups = new Map<string, ReviewIssue[]>();
  for (const issue of issues)
    groups.set(issue.file, [...(groups.get(issue.file) || []), issue]);
  const { counted } = review.check,
    last = review.lastExport;

  return (
    <div className="review space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
        >
          <TabsList aria-label="Issue filters" className="h-auto">
            {(
              [
                ["all", "All", review.issues.length],
                ["error", "Errors", counts.errors],
                ["warning", "Warnings", counts.warnings],
                ["info", "Notes", counts.notes],
              ] as const
            ).map(([value, label, count]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-1.5 px-2.5 text-xs sm:text-sm"
              >
                {label}
                <Badge
                  variant="secondary"
                  className="min-w-5 justify-center rounded-sm px-1 text-[10px] tabular-nums"
                >
                  {count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span role="status">
            {loading ? "Checking…" : `Checked ${ago(review.checkedAt, now)}`} ·{" "}
            {plural(counted.cards, "card")},{" "}
            {plural(counted.captures, "capture")},{" "}
            {plural(counted.locales, "language")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Check again
          </Button>
        </div>
      </div>

      {last ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <FileWarning className="size-3.5" />
          Last export {ago(last.finishedAt, now)}
          {last.options?.locales?.length
            ? ` · ${last.options.locales.map(language).join(", ")}`
            : " · every language"}
          {last.options?.kind
            ? ` · ${model.profiles[last.options.kind]?.label || last.options.kind} only`
            : ""}{" "}
          · {plural(last.cards, "card")} ·{" "}
          <span
            className={
              last.ok
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive"
            }
          >
            {last.ok ? "succeeded" : "failed"}
          </span>
        </p>
      ) : (
        <Alert>
          <Info />
          <AlertTitle>No export report yet</AlertTitle>
          <AlertDescription>
            <p>
              The check reads your files. Export renders every card and checks
              the result too: copy that overflows, devices cut off, backgrounds
              that break between cards. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                npx screenshot-studio export
              </code>{" "}
              and its findings appear here.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {!review.issues.length ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing to fix"
          description={`Every file checks out: ${plural(counted.galleries, "gallery", "galleries")}, ${plural(counted.cards, "card")}, ${plural(counted.captures, "capture")} and ${plural(counted.locales, "language")}.`}
        />
      ) : !issues.length ? (
        <EmptyState
          icon={CheckCircle2}
          title={`No ${filter === "error" ? "errors" : filter === "warning" ? "warnings" : "notes"}`}
          description="Other issues are hidden by this filter."
          action={
            <Button variant="outline" onClick={() => setFilter("all")}>
              Show all issues
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {[...groups].map(([file, list]) => (
            <Card
              key={file || "export"}
              className="gap-0 overflow-hidden py-0 shadow-none"
            >
              <h2 className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs">
                <code className="truncate font-medium">{file || "Export"}</code>
                <span className="shrink-0 text-muted-foreground">
                  {plural(list.length, "issue")}
                </span>
              </h2>
              <ul className="divide-y">
                {list.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    model={model}
                    route={route}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  model,
  route,
}: {
  issue: ReviewIssue;
  model: ProjectModel;
  route: Route;
}) {
  const level = levels[issue.level],
    Icon = level.icon,
    copyFile = issue.file.match(/^([^/]+)\/copy\.json$/)?.[1];
  return (
    <li
      className="review-issue flex items-start gap-3 p-4"
      data-level={issue.level}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", level.color)}
        aria-label={level.label}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm leading-snug font-medium">{issue.message}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {issue.path && (
              <code className="rounded bg-muted px-1 py-0.5">{issue.path}</code>
            )}
            {issue.card && (
              <span>
                {model.profiles[issue.card.kind]?.label ||
                  pretty(issue.card.kind)}{" "}
                card {position(issue.card.index)} · {pretty(issue.card.feature)}
              </span>
            )}
            {issue.locale && <span>{language(issue.locale)}</span>}
            <span>{issue.source === "export" ? "Last export" : "Check"}</span>
          </p>
          {issue.fix && (
            <p className="flex gap-1.5 text-xs leading-relaxed text-foreground/80">
              <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <span>{issue.fix}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 sm:ml-auto">
          {copyFile && model.locales.includes(copyFile) && !issue.card && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => route.go({ view: "copy", locale: copyFile })}
            >
              <Type />
              Edit words
            </Button>
          )}
          {issue.card && model.galleries[issue.card.kind] && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Open card ${pretty(issue.card.feature)}`}
              onClick={() =>
                route.go({
                  view: "gallery",
                  kind: issue.card!.kind,
                  card: issue.card!.index,
                  locale: issue.locale || null,
                  store: null,
                })
              }
            >
              Open card
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
