import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Crop, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/common";
import { position, pretty } from "@/lib/format";
import {
  cardsFor,
  devicesFor,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { ReviewIssue } from "@/lib/types";
import type { FrameState } from "../card-frame";
import { CardCaptures } from "./card-captures";
import { CardChecks } from "./card-checks";
import { CardLayout } from "./card-layout";
import { CardWords } from "./card-words";

interface InspectorProps {
  session: ProjectSession;
  model: ProjectModel;
  kind: string;
  index: number;
  locale: string;
  state: FrameState | undefined;
  issues: ReviewIssue[];
  onClose(): void;
  onMove(direction: number): void;
  onPicker(): void;
  onView(event: MouseEvent): void;
}

/** Everything about one card: its words in this language (editable), what the render and export noticed, its captures, callouts and gallery.json entry. */
export function Inspector({
  session,
  model,
  kind,
  index,
  locale,
  state,
  issues,
  onClose,
  onMove,
  onPicker,
  onView,
}: InspectorProps) {
  const cards = cardsFor(model.galleries, kind),
    card = cards[index],
    profile = model.profiles[kind];
  return (
    <div
      className="inspector flex min-h-0 flex-col"
      data-card={index}
      aria-label={`${pretty(card.feature)} card`}
      role="region"
    >
      <header className="flex items-start gap-2 border-b px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground tabular-nums">
            {position(index)} of {cards.length} ·{" "}
            {profile.label || pretty(kind)}
          </p>
          <h2 className="truncate text-base font-semibold tracking-tight">
            {pretty(card.feature)}
          </h2>
        </div>
        <div className="-mr-2 flex shrink-0 items-center">
          <IconButton
            label="Previous card"
            onClick={() => onMove(-1)}
            disabled={index === 0}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next card"
            onClick={() => onMove(1)}
            disabled={index === cards.length - 1}
          >
            <ChevronRight />
          </IconButton>
          <IconButton label="Close inspector" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain">
        <div className="flex flex-wrap gap-2 px-5 py-3">
          <Button size="sm" variant="outline" onClick={onView}>
            <Maximize2 />
            Open in viewer
          </Button>
          {devicesFor(card).length > 0 && (
            <Button size="sm" variant="outline" onClick={onPicker}>
              <Crop />
              {card.callouts?.length ? "Edit callout" : "Pick callout"}
            </Button>
          )}
        </div>
        <CardWords
          session={session}
          model={model}
          kind={kind}
          card={card}
          locale={locale}
        />
        <CardChecks state={state} issues={issues} reference={model.reference} />
        <CardCaptures model={model} card={card} locale={locale} />
        <CardLayout model={model} kind={kind} card={card} index={index} />
      </div>
    </div>
  );
}
