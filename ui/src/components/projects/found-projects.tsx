import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Status } from "@/components/common";
import type { Discovery } from "@/lib/types";

/** What Find projects found, each to tick for connecting; connected ones are shown but fixed. */
export function FoundProjects({
  found,
  selected,
  onSelect,
}: {
  found: Discovery;
  selected: ReadonlySet<string>;
  onSelect(root: string, selected: boolean): void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {found.projects.length} projects found
      </p>
      <ScrollArea className="max-h-64 rounded-md border">
        <div className="space-y-1 p-2">
          {found.projects.map((p) => (
            <Label
              key={p.root}
              className="flex cursor-pointer items-center gap-3 rounded-md p-3 hover:bg-accent"
            >
              <Checkbox
                checked={selected.has(p.root)}
                disabled={!!p.registeredId}
                onCheckedChange={(checked) =>
                  onSelect(p.root, checked === true)
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{p.name}</span>
                <span className="mt-1 block text-xs leading-relaxed font-normal break-all text-muted-foreground">
                  {p.root}
                </span>
              </span>
              <Status>
                {p.registeredId
                  ? "Connected"
                  : p.kind === "studio"
                    ? "Studio"
                    : "Library"}
              </Status>
            </Label>
          ))}
        </div>
      </ScrollArea>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {found.truncated
          ? "The search reached its folder limit. Search a smaller parent folder to find more."
          : "Only selected folders will be connected. Your project files stay in place."}
      </p>
    </div>
  );
}
