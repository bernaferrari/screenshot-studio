import { EmptyState } from "@/components/common";
import {
  cardsFor,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Strip } from "@/lib/strips";
import type { FrameState } from "./card-frame";
import { GalleryStrip, type FrameStates } from "./gallery-strip";

/** Every kept strip, mounted; only the current one shows. */
export function KeptStrips({
  strips,
  current,
  session,
  model,
  height,
  joined,
  selected,
  onSelect,
  onPicker,
  onState,
  states,
}: {
  strips: ReadonlyMap<string, Strip>;
  /** The key of the strip to show. */
  current: string;
  session: ProjectSession;
  model: ProjectModel;
  height: number;
  joined: boolean;
  /** The inspected card, in the current strip. */
  selected: number | null;
  onSelect(index: number): void;
  onPicker(kind: string, index: number): void;
  onState(key: string, state: FrameState): void;
  states: FrameStates;
}) {
  return (
    <div id="view">
      {[...strips].map(([key, strip]) => {
        const cards = cardsFor(model.galleries, strip.kind),
          shown = key === current;
        return (
          <div
            key={key}
            className="editor-view"
            hidden={!shown}
            inert={!shown || undefined}
          >
            {cards.length ? (
              <GalleryStrip
                model={model}
                locale={strip.locale}
                kind={strip.kind}
                cards={cards}
                height={height}
                source={strip.source}
                joined={joined}
                revision={session.revision(strip.locale)}
                exportRevision={session.exportRevision(strip.locale)}
                selected={shown ? selected : null}
                onSelect={onSelect}
                onPicker={onPicker}
                onState={onState}
                states={states}
              />
            ) : (
              <EmptyState
                title="No cards in this gallery"
                description={`Add cards to "${strip.kind}" in gallery.json; they appear here as soon as the file is saved.`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
