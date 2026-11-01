import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/common";
import { language } from "@/lib/format";
import {
  copyCoverage,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Route } from "@/lib/route";

/** Back to every language, how much of this one is written, and another language. */
export function CopyHeader({
  session,
  model,
  locale,
  route,
}: {
  session: ProjectSession;
  model: ProjectModel;
  locale: string;
  route: Route;
}) {
  const coverage = copyCoverage(session.drafts, model.reference, locale);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => route.go({ view: "languages", locale: null })}
      >
        <ArrowLeft />
        All languages
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {coverage.translated} / {coverage.total} fields
        </span>
        <Choice
          label="Language"
          value={locale}
          onChange={(next) => route.go({ locale: next })}
          items={model.locales.map((code) => ({
            value: code,
            label: `${language(code)}${code === model.reference ? " · reference" : ""}`,
          }))}
          className="w-56"
        />
      </div>
    </div>
  );
}
