import { Toggle } from "@/components/ui/toggle";
import { Choice, SearchField } from "@/components/common";
import { position, pretty } from "@/lib/format";

/** Search the copy, show only missing fields, or jump to a card's words. */
export function CopyFilters({
  query,
  onQuery,
  missing,
  onMissing,
  keys,
  onJump,
}: {
  query: string;
  onQuery(query: string): void;
  missing: boolean;
  onMissing(missing: boolean): void;
  keys: string[];
  onJump(key: string): void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="min-w-48 flex-1">
        <SearchField
          label="Search copy"
          value={query}
          onChange={onQuery}
          placeholder="Find a card or phrase…"
        />
      </div>
      <Toggle
        pressed={missing}
        onPressedChange={onMissing}
        variant="outline"
        aria-label="Missing only"
      >
        Missing only
      </Toggle>
      <Choice
        label="Jump to copy card"
        value="_jump"
        onChange={(key) => key !== "_jump" && onJump(key)}
        items={[
          { value: "_jump", label: "Jump to card…" },
          ...keys.map((key, i) => ({
            value: key,
            label: `${position(i)} · ${pretty(key)}`,
          })),
        ]}
        className="w-44"
      />
    </div>
  );
}
