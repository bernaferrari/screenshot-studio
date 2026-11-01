import { Copy, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Save the callout (the form's submit), copy its JSON, or remove the card's callouts. */
export function PickerActions({
  valid,
  busy,
  removable,
  onCopy,
  onRemove,
}: {
  valid: boolean;
  busy: boolean;
  /** The card has callouts to remove. */
  removable: boolean;
  onCopy(): void;
  onRemove(): void;
}) {
  return (
    <div className="space-y-2 border-t pt-4">
      <Button
        type="submit"
        className="w-full"
        aria-label="Save as this card's callout"
        disabled={!valid}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Save />}
        Save callout
      </Button>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={!valid}
          onClick={onCopy}
        >
          <Copy />
          Copy JSON
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          disabled={busy || !removable}
          onClick={onRemove}
        >
          <Trash2 />
          Remove
        </Button>
      </div>
    </div>
  );
}
