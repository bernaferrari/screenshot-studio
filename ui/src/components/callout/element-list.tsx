import type { Dispatch } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { findNodes, nodeName, parentNode, type PickEvent } from "@/lib/callout";
import type { UiNode } from "@/lib/types";

/** The capture's elements to search and pick from, and the picked one with its parent a click away. */
export function ElementList({
  nodes,
  selected,
  query,
  onQuery,
  containers,
  onContainers,
  pinnedById,
  dispatch,
}: {
  nodes: UiNode[];
  selected: UiNode | null;
  query: string;
  onQuery(query: string): void;
  /** List layout containers too, not only elements with words, IDs or controls. */
  containers: boolean;
  onContainers(containers: boolean): void;
  /** The callout finds its element by resource ID rather than path. */
  pinnedById: boolean;
  dispatch: Dispatch<PickEvent>;
}) {
  const found = findNodes(nodes, query, containers, selected),
    parent = selected && parentNode(nodes, selected);
  return (
    <div className="space-y-3">
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          placeholder="Find text, label, or ID…"
          aria-label="Find accessibility element"
          value={query}
          onValueChange={onQuery}
        />
        <CommandList aria-label="Accessibility elements" className="max-h-44">
          <CommandEmpty>No matching elements</CommandEmpty>
          {found.map((n) => (
            <CommandItem
              key={n.path}
              value={n.path}
              onSelect={() => dispatch({ type: "select", node: n })}
              className="items-start"
            >
              <span className="min-w-0 flex-1 truncate text-xs">
                {nodeName(n)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {n.b[2] - n.b[0]} × {n.b[3] - n.b[1]}
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {found.length} / {nodes.length} elements
        </span>
        <Label className="text-xs">
          <Checkbox
            checked={containers}
            onCheckedChange={(checked) => onContainers(checked === true)}
          />
          Containers
        </Label>
      </div>
      {selected && (
        <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
          <p className="font-medium break-words">{nodeName(selected)}</p>
          <p className="text-muted-foreground">
            {pinnedById ? "Pinned by resource ID" : "Pinned by path and class"}{" "}
            · exact bounds
          </p>
          <code className="block break-all text-muted-foreground">
            {selected.path}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!parent}
            onClick={() => parent && dispatch({ type: "select", node: parent })}
          >
            <ArrowUp />
            Parent element
          </Button>
        </div>
      )}
    </div>
  );
}
