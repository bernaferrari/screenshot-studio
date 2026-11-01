import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { IconButton } from "@/components/common";
import { copyText, position, pretty } from "@/lib/format";
import { outputFile, type ProjectModel } from "@/lib/project";
import type { Card } from "@/lib/types";
import { Section } from "./section";

/** The card's layout words, output file, size and variables, and its gallery.json entry. */
export function CardLayout({
  model,
  kind,
  card,
  index,
}: {
  model: ProjectModel;
  kind: string;
  card: Card;
  index: number;
}) {
  const profile = model.profiles[kind],
    gallery = model.galleries[kind],
    entry = Array.isArray(gallery) ? gallery[index] : gallery.cards[index],
    inherits = Array.isArray(gallery) ? null : gallery.inherits,
    output = outputFile(kind, card, index);
  return (
    <Section title="Layout">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Layout</dt>
        <dd className="flex flex-wrap gap-1">
          {card.layout ? (
            card.layout.split(/\s+/).map((word) => (
              <Badge
                key={word}
                variant="outline"
                className="font-mono text-[11px]"
              >
                {word}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">Default</span>
          )}
        </dd>
        <dt className="text-muted-foreground">Output</dt>
        <dd className="truncate font-mono text-xs leading-5" title={output}>
          {output}
        </dd>
        <dt className="text-muted-foreground">Size</dt>
        <dd className="tabular-nums">
          {profile.width} × {profile.height}
        </dd>
        {inherits && (
          <>
            <dt className="text-muted-foreground">Inherits</dt>
            <dd>
              {model.profiles[inherits]?.label || pretty(inherits)} card{" "}
              {position(index)}
            </dd>
          </>
        )}
        {card.vars && (
          <>
            <dt className="text-muted-foreground">Variables</dt>
            <dd className="font-mono text-xs leading-5 break-all">
              {Object.entries(card.vars)
                .map(([name, value]) => `${name}: ${value}`)
                .join("; ")}
            </dd>
          </>
        )}
      </dl>
      <EntryJson
        entry={entry}
        label={
          inherits
            ? `gallery.json · ${kind}.cards[${index}]`
            : `gallery.json · ${kind}[${index}]`
        }
      />
    </Section>
  );
}

function EntryJson({ entry, label }: { entry: unknown; label: string }) {
  const text = JSON.stringify(entry, null, 2);
  return (
    <Collapsible className="rounded-md border">
      <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 font-mono text-xs">
            {label}
          </Button>
        </CollapsibleTrigger>
        <IconButton
          label="Copy card JSON"
          className="size-7"
          onClick={() =>
            copyText(text)
              .then(() => toast.success("Card JSON copied"))
              .catch(() => toast.error("Clipboard access is unavailable."))
          }
        >
          <Copy />
        </IconButton>
      </div>
      <CollapsibleContent>
        <Separator />
        <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
