import type { MouseEvent } from "react";
import { Check, Eye, Loader2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/common";
import type { Draft } from "@/lib/drafts";
import { modifierKey } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Sticky over the copy: whether it's saved, the preview on narrow screens, and Save copy. */
export function SaveBar({
  draft,
  dirty,
  locale,
  onPreview,
}: {
  draft: Draft;
  dirty: boolean;
  locale: string;
  /** Open the saved card in the viewer; missing when the words show on no card. */
  onPreview: ((event: MouseEvent) => void) | undefined;
}) {
  return (
    <Card className="sticky top-16 z-10 gap-0 border py-0 shadow-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
        <span
          role="status"
          className={cn(
            "flex items-center gap-2 text-xs",
            draft.error
              ? "text-destructive"
              : dirty
                ? "text-amber-800 dark:text-amber-300"
                : "text-muted-foreground",
          )}
        >
          {draft.saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : dirty ? (
            <Type className="size-4" />
          ) : (
            <Check className="size-4" />
          )}
          {draft.saving
            ? "Saving…"
            : dirty
              ? "Unsaved · kept in this tab"
              : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          <Kbd className="hidden lg:inline-flex">{modifierKey} ↵</Kbd>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="xl:hidden"
            onClick={onPreview}
            disabled={!onPreview}
          >
            <Eye />
            Preview
          </Button>
          <Button
            type="submit"
            size="sm"
            aria-label={`Save ${locale}/copy.json`}
            disabled={!dirty || draft.saving || draft.conflict}
          >
            {draft.saving ? <Loader2 className="animate-spin" /> : <Check />}
            Save copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
