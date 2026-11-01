import type { Dispatch } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Pick, PickEvent } from "@/lib/callout";
import type { Callout } from "@/lib/types";

const boxFields = [
  ["x", "X"],
  ["y", "Y"],
  ["w", "Width"],
  ["h", "Height"],
] as const;

/** Magnification and corner radius, and under Precise selection the box in numbers and the callout's JSON. */
export function CalloutSettings({
  pick,
  value,
  dispatch,
}: {
  pick: Pick;
  value: Callout | null;
  dispatch: Dispatch<PickEvent>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="mag">Magnification</Label>
          <Input
            id="mag"
            type="number"
            min="1"
            max="3"
            step="0.01"
            value={pick.mag}
            onChange={(e) =>
              dispatch({ type: "set", field: "mag", value: e.target.value })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="radius">Corner radius</Label>
          <Input
            id="radius"
            type="number"
            min="0"
            step="1"
            value={pick.radius}
            onChange={(e) =>
              dispatch({ type: "set", field: "radius", value: e.target.value })
            }
            required
          />
        </div>
      </div>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Precise selection
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            {boxFields.map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`box-${key}`}>{label}</Label>
                <Input
                  id={`box-${key}`}
                  type="number"
                  min={key === "w" || key === "h" ? 1 : 0}
                  step="1"
                  value={pick.box?.[key] ?? 0}
                  onChange={(e) =>
                    dispatch({
                      type: "edit",
                      key,
                      value: Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-[10px]">
            {value ? JSON.stringify(value, null, 2) : "Draw a selection"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
