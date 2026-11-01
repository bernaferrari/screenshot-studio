import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/common";
import { CopyField } from "@/components/copy-field";
import { errorMessage } from "@/lib/api";
import { cardFields } from "@/lib/copy";
import { isDirty } from "@/lib/drafts";
import { language, modifierKey, pretty } from "@/lib/format";
import {
  cardCopyKeys,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Card } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Section } from "./section";

/** The card's words in this language beside the reference, saved to that language's copy.json. */
export function CardWords({
  session,
  model,
  kind,
  card,
  locale,
}: {
  session: ProjectSession;
  model: ProjectModel;
  kind: string;
  card: Card;
  locale: string;
}) {
  const draft = session.draft(locale),
    reference = session.draft(model.reference).data,
    words = draft.data,
    // Words come from the card's feature and its "<gallery>/<feature>" entry.
    keys = cardCopyKeys(card, kind).filter((key) => reference[key]),
    fields = cardFields(
      card,
      kind,
      keys,
      reference,
      locale !== model.reference,
    ),
    galleryLabel = model.profiles[kind].label || pretty(kind),
    dirty = isDirty(draft);
  const save = async () => {
    if (!dirty || draft.saving || draft.conflict) return;
    try {
      await session.save(locale);
      toast.success(`${language(locale)} words saved`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Section
      title={`Words · ${language(locale)}`}
      aside={
        <span
          role="status"
          className={cn(
            "flex items-center gap-1.5 text-xs",
            draft.error
              ? "text-destructive"
              : dirty
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
          )}
        >
          {draft.saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : dirty ? null : (
            <Check className="size-3.5" />
          )}
          {draft.saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
        </span>
      }
    >
      {draft.conflict && (
        <Alert className="border-amber-500/30">
          <AlertTriangle />
          <AlertTitle>The saved words changed</AlertTitle>
          <AlertDescription>
            {locale}/copy.json changed on disk while you had unsaved words.
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => session.resolve(locale, "draft")}
              >
                Keep mine
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => session.resolve(locale, "saved")}
              >
                Use saved
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {fields.length ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        >
          {keys.length > 1 && (
            <p className="text-xs text-muted-foreground">
              This card's {pretty(kind)} words override its shared words.
            </p>
          )}
          {fields.map(([key, field]) => (
            <CopyField
              key={`${key}/${field}`}
              locale={locale}
              reference={model.reference}
              copyKey={key}
              field={field}
              value={words[key]?.[field] ?? ""}
              referenceText={reference[key]?.[field]}
              onChange={(value) => session.edit(locale, key, field, value)}
              stacked
            />
          ))}
          {draft.error && (
            <p className="text-xs text-destructive">{draft.error}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {keys.some((key) => key.includes("/"))
                ? `Only in ${galleryLabel}`
                : "Shared by every gallery"}
            </p>
            <div className="flex items-center gap-2">
              <Kbd className="hidden sm:inline-flex">{modifierKey} ↵</Kbd>
              <Button
                type="submit"
                size="sm"
                aria-label={`Save ${locale}/copy.json`}
                disabled={!dirty || draft.saving || draft.conflict}
              >
                {draft.saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Check />
                )}
                Save words
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {card.identity
            ? "This card shows a name banner instead of a headline."
            : `This card has no words in ${language(model.reference)} yet. Write them in the reference language first.`}
        </p>
      )}
    </Section>
  );
}
