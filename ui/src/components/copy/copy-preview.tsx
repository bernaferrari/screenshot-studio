import type { MouseEvent } from "react";
import { CardFrame } from "@/components/gallery/card-frame";
import { pretty } from "@/lib/format";
import type { ProjectModel } from "@/lib/project";
import type { Card } from "@/lib/types";

/** The saved card the words being edited belong to; click to enlarge it. */
export function CopyPreview({
  model,
  locale,
  kind,
  card,
  index,
  revision,
  translating,
  onOpen,
}: {
  model: ProjectModel;
  locale: string;
  kind: string;
  card: Card;
  index: number;
  revision: string;
  translating: boolean;
  onOpen(event: MouseEvent): void;
}) {
  const profile = model.profiles[kind];
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Saved artwork</span>
        <span>{profile.label || pretty(kind)}</span>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Enlarge ${pretty(card.feature)} preview`}
        className="flex w-full cursor-zoom-in justify-center rounded-xl border bg-muted/40 p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
      >
        <CardFrame
          model={model}
          locale={locale}
          kind={kind}
          card={card}
          index={index}
          height={Math.min(480, (274 * profile.height) / profile.width)}
          source="live"
          revision={revision}
        />
      </button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {translating
          ? "Empty fields use the reference. The preview updates when you save."
          : "You're editing the reference. Other languages use these words until translated."}
      </p>
    </div>
  );
}
