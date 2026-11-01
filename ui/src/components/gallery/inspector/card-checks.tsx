import { AlertTriangle, Check, Info, OctagonAlert } from "lucide-react";
import { reportNotes } from "@/lib/report";
import type { ReviewIssue } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FrameState } from "../card-frame";
import { Section } from "./section";

const levelIcon = { error: OctagonAlert, warning: AlertTriangle, info: Info };
const levelColor = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

/** What the live render and the review noticed about the card. */
export function CardChecks({
  state,
  issues,
  reference,
}: {
  state: FrameState | undefined;
  issues: ReviewIssue[];
  reference: string;
}) {
  const notes = reportNotes(
    state?.status === "ready" ? state.report : null,
    reference,
  );
  return (
    <Section title="Checks">
      {state?.status === "loading" || !state ? (
        <p className="text-xs text-muted-foreground">
          Rendering the live preview…
        </p>
      ) : state.status === "failed" ? (
        <p className="text-sm text-destructive">
          The live preview didn't finish rendering. Check theme.js for errors.
        </p>
      ) : null}
      {notes.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {notes.map((text) => (
            <li key={text} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              {text}
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <ul
          className="space-y-3 text-sm"
          aria-label="Review issues for this card"
        >
          {issues.map((issue) => {
            const Icon = levelIcon[issue.level];
            return (
              <li key={issue.id} className="flex gap-2">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    levelColor[issue.level],
                  )}
                />
                <div className="min-w-0 space-y-1">
                  <p className="leading-snug">{issue.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {issue.source === "export" ? "Last export" : "Check"} ·{" "}
                    <code>{issue.file}</code>
                  </p>
                  {issue.fix && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {issue.fix}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {state?.status === "ready" && !notes.length && !issues.length && (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="size-4" />
          Nothing to fix on this card.
        </p>
      )}
    </Section>
  );
}
