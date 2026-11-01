import type { Ref } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Status } from "@/components/common";
import { fieldName, language } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The DOM id for one field of one card's words in one language. */
export const fieldId = (locale: string, key: string, field: string) =>
  `${locale}-${key}-${field}`.replace(/[^a-zA-Z0-9_-]/g, "-");

/**
 * One field of a card's words: the reference text beside (or above) the field for translations, the character count,
 * and a visible note when the field is empty and the card falls back to the reference.
 */
export function CopyField({
  locale,
  reference,
  copyKey,
  field,
  value,
  referenceText,
  onChange,
  onFocus,
  onBlur,
  textareaRef,
  stacked = false,
}: {
  locale: string;
  reference: string;
  copyKey: string;
  field: string;
  value: string;
  referenceText?: string;
  onChange(value: string): void;
  onFocus?(): void;
  onBlur?(): void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Always put the reference above the field (narrow panels). */
  stacked?: boolean;
}) {
  const id = fieldId(locale, copyKey, field),
    empty = !value.trim(),
    translating = locale !== reference;
  return (
    <div className="copy-field @container/field space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{fieldName(field)}</Label>
        {empty ? (
          <Status id={`${id}-status`} tone="warning">
            {translating ? "Uses reference" : "Empty reference field"}
          </Status>
        ) : (
          <span
            id={`${id}-status`}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {Array.from(value).length} characters
          </span>
        )}
      </div>
      <div
        className={cn(
          "grid min-w-0 gap-3",
          translating &&
            !stacked &&
            "@min-[36rem]/field:grid-cols-2 @min-[36rem]/field:gap-4",
        )}
      >
        {translating && (
          <div className="copy-reference rounded-lg bg-muted/50 p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">
              {language(reference)} · reference
            </p>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
              lang={reference}
            >
              {referenceText || <span className="italic">Empty</span>}
            </p>
          </div>
        )}
        <div>
          {translating && !stacked && (
            <p className="mb-1.5 text-xs text-muted-foreground @max-[36rem]/field:hidden">
              {language(locale)}
            </p>
          )}
          <Textarea
            id={id}
            ref={textareaRef}
            aria-label={`${locale} ${copyKey} ${field}`}
            aria-describedby={`${id}-status`}
            dir="auto"
            lang={locale}
            value={value}
            placeholder={
              translating
                ? "Translate the reference…"
                : `Write ${fieldName(field).toLowerCase()}…`
            }
            rows={field === "body" ? 3 : Math.max(2, value.split("\n").length)}
            className={cn(
              "resize-y text-base md:text-sm",
              empty && "border-amber-500/30 bg-amber-500/5",
            )}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
