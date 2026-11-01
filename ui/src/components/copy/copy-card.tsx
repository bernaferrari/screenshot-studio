import type { Ref } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyField } from "@/components/copy-field";
import { position, pretty } from "@/lib/format";
import type { CopyEntry } from "@/lib/types";

/** One copy key's fields beside the reference; fields filtered out stay mounted, hidden. */
export function CopyCard({
  copyKey,
  index,
  scope,
  fields,
  shown,
  locale,
  reference,
  words,
  referenceWords,
  onChange,
  onFocus,
  onBlur,
  cardRef,
  textareaRef,
}: {
  copyKey: string;
  index: number;
  /** Which gallery the words belong to, or that every gallery shares them. */
  scope: string;
  fields: string[];
  shown: string[];
  locale: string;
  reference: string;
  words: CopyEntry | undefined;
  referenceWords: CopyEntry;
  onChange(field: string, value: string): void;
  onFocus(field: string): void;
  onBlur(): void;
  cardRef: Ref<HTMLDivElement>;
  /** The first field, focused by Jump to card. */
  textareaRef: Ref<HTMLTextAreaElement>;
}) {
  return (
    <Card
      hidden={!shown.length}
      ref={cardRef}
      className="copy-card scroll-mt-36 gap-0 overflow-hidden py-0 shadow-none"
    >
      <CardHeader className="flex flex-row items-center gap-3 border-b px-5 py-3.5">
        <span className="text-xs text-muted-foreground tabular-nums">
          {position(index)}
        </span>
        <CardTitle className="text-sm">
          {pretty(copyKey.split("/").at(-1))}
        </CardTitle>
        <span className="ml-auto text-right text-xs text-muted-foreground">
          {scope}
        </span>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {fields.map((field, j) => (
          <section
            key={field}
            hidden={!shown.includes(field)}
            className="p-4 sm:p-5"
          >
            <CopyField
              locale={locale}
              reference={reference}
              copyKey={copyKey}
              field={field}
              value={words?.[field] ?? ""}
              referenceText={referenceWords[field]}
              onChange={(value) => onChange(field, value)}
              onFocus={() => onFocus(field)}
              onBlur={onBlur}
              textareaRef={j === 0 ? textareaRef : undefined}
            />
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
