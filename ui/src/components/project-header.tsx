import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectAvatar } from "./common";
import type { ProjectActions } from "./projects/project-dialogs";
import { ProjectMenu } from "./projects/project-menu";
import { ago, copyText, plural } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { LiveState } from "@/lib/live";
import type { ProjectModel } from "@/lib/project";
import type { Route } from "@/lib/route";
import type { StudioProject } from "@/lib/types";
import { cn } from "@/lib/utils";

function LiveIndicator({ state }: { state: LiveState }) {
  const [label, hint, dot] =
    state === "live"
      ? [
          "Live",
          "Previews update as soon as the project's files change.",
          "bg-emerald-500",
        ]
      : state === "connecting"
        ? [
            "Connecting",
            "Reconnecting to the studio to follow file changes.",
            "bg-amber-500 animate-pulse",
          ]
        : [
            "Not live",
            "File changes aren't followed. Reload the page to see them.",
            "bg-muted-foreground/50",
          ];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="live-indicator inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
          data-state={state}
          tabIndex={0}
        >
          <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

function Stat({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "warning" | "danger" | "success";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-medium tabular-nums",
          tone === "warning" && "text-amber-700 dark:text-amber-300",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** The project's name, where it lives, its numbers at a glance, and its sections (children). */
export function ProjectHeader({
  summary,
  model,
  live,
  counts,
  reviewing,
  route,
  actions,
  children,
}: {
  summary: StudioProject | undefined;
  model: ProjectModel;
  live: LiveState;
  counts: { errors: number; warnings: number; notes: number };
  reviewing: boolean;
  route: Route;
  actions: ProjectActions;
  children: ReactNode;
}) {
  const now = useNow(),
    name = summary?.name || model.config.app || "Project",
    totals = summary?.totals,
    galleries = Object.keys(model.galleries).length,
    issues = counts.errors + counts.warnings;
  const reviewURL = `${route.base}?view=review`;
  return (
    <header className="space-y-5 border-b">
      <div className="flex items-start gap-4">
        <ProjectAvatar
          project={{ name, icon: summary?.icon }}
          className="size-12 rounded-xl text-lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {name}
          </h1>
          {summary && (
            <button
              type="button"
              title="Copy the project folder"
              onClick={() =>
                copyText(summary.root)
                  .then(() => toast.success("Project folder copied"))
                  .catch(() => toast.error("Clipboard access is unavailable."))
              }
              className="mt-0.5 block max-w-full truncate rounded font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {summary.displayRoot}
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <LiveIndicator state={live} />
          {summary && <ProjectMenu project={summary} actions={actions} />}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 @min-[40rem]/workbench:flex @min-[40rem]/workbench:flex-wrap">
        <Stat label="Cards">
          {summary ? summary.cardCount : "–"}{" "}
          <span className="font-normal text-muted-foreground">
            in {plural(galleries, "gallery", "galleries")}
          </span>
        </Stat>
        <Stat
          label="Languages"
          tone={
            summary && summary.completeLocales === summary.locales.length
              ? "success"
              : undefined
          }
        >
          {summary
            ? `${summary.completeLocales} / ${summary.locales.length}`
            : model.locales.length}{" "}
          <span className="font-normal text-muted-foreground">complete</span>
        </Stat>
        {totals && (
          <Stat
            label="Captures"
            tone={
              totals.captures < totals.expectedCaptures ? "warning" : undefined
            }
          >
            {totals.captures} / {totals.expectedCaptures}
          </Stat>
        )}
        {totals && (
          <Stat
            label="Exports"
            tone={
              totals.exports < totals.expectedExports ? "warning" : undefined
            }
          >
            {totals.exports} / {totals.expectedExports}{" "}
            <span className="font-normal text-muted-foreground">
              · {summary?.lastExport ? ago(summary.lastExport, now) : "never"}
            </span>
          </Stat>
        )}
        <Stat
          label="To fix"
          tone={counts.errors ? "danger" : issues ? "warning" : "success"}
        >
          <Link
            to={reviewURL}
            className="rounded underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {reviewing && !issues && !counts.notes
              ? "Checking…"
              : issues
                ? [
                    counts.errors && plural(counts.errors, "error"),
                    counts.warnings && plural(counts.warnings, "warning"),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Nothing"}
          </Link>
        </Stat>
      </dl>
      {children}
    </header>
  );
}
