import { useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Info,
  Loader2,
  Maximize2,
  OctagonAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { IconButton, Kbd, Status } from "@/components/common";
import { CopyField } from "@/components/copy-field";
import { useMediaViewer } from "@/components/media-viewer";
import { asset, errorMessage } from "@/lib/api";
import { isDirty } from "@/lib/drafts";
import {
  copyText,
  language,
  modifierKey,
  position,
  pretty,
} from "@/lib/format";
import {
  cardCopyKeys,
  cardsFor,
  devicesFor,
  outputFile,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Callout, ReviewIssue } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FrameState } from "./card-frame";

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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const levelIcon = { error: OctagonAlert, warning: AlertTriangle, info: Info };
const levelColor = {
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

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
    profile = model.profiles[kind],
    gallery = model.galleries[kind],
    entry = Array.isArray(gallery) ? gallery[index] : gallery.cards[index],
    inherits = Array.isArray(gallery) ? null : gallery.inherits,
    devices = devicesFor(card),
    draft = session.draft(locale),
    referenceWords = session.draft(model.reference).data,
    words = draft.data,
    translating = locale !== model.reference,
    report = state?.status === "ready" ? state.report : null;
  // Words come from the card's feature and its "<gallery>/<feature>" entry; a card with none yet gets a headline and a line.
  const keys = cardCopyKeys(card, kind).filter((key) => referenceWords[key]);
  const fields: [string, string][] = keys.length
    ? keys.flatMap((key) =>
        Object.keys(referenceWords[key] || {})
          .filter((field) => !translating || referenceWords[key][field]?.trim())
          .map((field): [string, string] => [key, field]),
      )
    : translating
      ? []
      : [
          [
            card.sharedCopy === false
              ? `${kind}/${card.feature}`
              : card.feature,
            "title",
          ],
          [
            card.sharedCopy === false
              ? `${kind}/${card.feature}`
              : card.feature,
            "body",
          ],
        ];
  const dirty = isDirty(draft);
  const save = async () => {
    if (!dirty || draft.saving || draft.conflict) return;
    try {
      await session.save(locale);
      toast.success(`${language(locale)} words saved`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const problems = report
    ? [
        report.missingCopy.length > 0 &&
          `Untranslated: ${report.missingCopy.join(", ")}`,
        report.fallbackCaptures.length > 0 &&
          `Borrows the ${model.reference} capture: ${report.fallbackCaptures.join(", ")}`,
        report.fixedCallouts.length > 0 &&
          "A callout kept its reference position",
        report.fit === 0 && "The words don't fit, even shrunk",
        report.fit > 0 &&
          report.fit < 1 &&
          `Words shrunk to ${Math.round(report.fit * 100)}% to fit`,
      ].filter((text): text is string => !!text)
    : [];

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
          {devices.length > 0 && (
            <Button size="sm" variant="outline" onClick={onPicker}>
              <Crop />
              {card.callouts?.length ? "Edit callout" : "Pick callout"}
            </Button>
          )}
        </div>

        <Section
          title={`Words · ${language(locale)}`}
          aside={
            <span
              role="status"
              className={cn(
                "flex items-center gap-1.5 text-xs",
                draft.error
                  ? "text-destructive"
                  : dirty
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
              )}
            >
              {draft.saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : dirty ? null : (
                <Check className="size-3.5" />
              )}
              {draft.saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
            </span>
          }
        >
          {draft.conflict && (
            <Alert className="border-amber-500/30">
              <AlertTriangle />
              <AlertTitle>The saved words changed</AlertTitle>
              <AlertDescription>
                {locale}/copy.json changed on disk while you had unsaved words.
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => session.resolve(locale, "draft")}
                  >
                    Keep mine
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => session.resolve(locale, "saved")}
                  >
                    Use saved
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {fields.length ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            >
              {keys.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  This card's {pretty(kind)} words override its shared words.
                </p>
              )}
              {fields.map(([key, field]) => (
                <CopyField
                  key={`${key}/${field}`}
                  locale={locale}
                  reference={model.reference}
                  copyKey={key}
                  field={field}
                  value={words[key]?.[field] ?? ""}
                  referenceText={referenceWords[key]?.[field]}
                  onChange={(value) => session.edit(locale, key, field, value)}
                  stacked
                />
              ))}
              {draft.error && (
                <p className="text-xs text-destructive">{draft.error}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {keys.some((key) => key.includes("/"))
                    ? `Only in ${profile.label || pretty(kind)}`
                    : "Shared by every gallery"}
                </p>
                <div className="flex items-center gap-2">
                  <Kbd className="hidden sm:inline-flex">{modifierKey} ↵</Kbd>
                  <Button
                    type="submit"
                    size="sm"
                    aria-label={`Save ${locale}/copy.json`}
                    disabled={!dirty || draft.saving || draft.conflict}
                  >
                    {draft.saving ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    Save words
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {card.identity
                ? "This card shows a name banner instead of a headline."
                : `This card has no words in ${language(model.reference)} yet. Write them in the reference language first.`}
            </p>
          )}
        </Section>

        <Section title="Checks">
          {state?.status === "loading" || !state ? (
            <p className="text-xs text-muted-foreground">
              Rendering the live preview…
            </p>
          ) : state.status === "failed" ? (
            <p className="text-sm text-destructive">
              The live preview didn't finish rendering. Check theme.js for
              errors.
            </p>
          ) : null}
          {problems.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {problems.map((text) => (
                <li key={text} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  {text}
                </li>
              ))}
            </ul>
          )}
          {issues.length > 0 && (
            <ul
              className="space-y-3 text-sm"
              aria-label="Review issues for this card"
            >
              {issues.map((issue) => {
                const Icon = levelIcon[issue.level];
                return (
                  <li key={issue.id} className="flex gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        levelColor[issue.level],
                      )}
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="leading-snug">{issue.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {issue.source === "export" ? "Last export" : "Check"} ·{" "}
                        <code>{issue.file}</code>
                      </p>
                      {issue.fix && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {issue.fix}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {state?.status === "ready" && !problems.length && !issues.length && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" />
              Nothing to fix on this card.
            </p>
          )}
        </Section>

        <Section
          title={
            devices.length === 1 ? "Capture" : `Captures · ${devices.length}`
          }
        >
          {devices.length ? (
            <div className="grid grid-cols-3 gap-3">
              {devices.map((device, i) => (
                <Capture
                  key={`${locale}:${device.raw}:${i}`}
                  model={model}
                  locale={locale}
                  raw={device.raw}
                  role={device.role}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Art only: this card shows no capture.
            </p>
          )}
          {(card.callouts || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Callouts</p>
              <ul className="space-y-1.5">
                {card.callouts!.map((callout, i) => (
                  <CalloutRow key={i} callout={callout} />
                ))}
              </ul>
            </div>
          )}
        </Section>

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
            <dd
              className="truncate font-mono text-xs leading-5"
              title={outputFile(kind, card, index)}
            >
              {outputFile(kind, card, index)}
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
      </div>
    </div>
  );
}

function Capture({
  model,
  locale,
  raw,
  role,
}: {
  model: ProjectModel;
  locale: string;
  raw: string;
  role?: string;
}) {
  const openViewer = useMediaViewer();
  const [from, setFrom] = useState<string | null>(locale);
  const src = from ? asset(model.base, `../${from}/raw/${raw}`) : null;
  return (
    <figure className="min-w-0 space-y-1.5">
      <button
        type="button"
        aria-label={`Show capture ${raw}`}
        disabled={!src}
        onClick={(event) =>
          src &&
          openViewer(
            {
              items: [
                {
                  id: src,
                  type: "image",
                  src,
                  title: raw,
                  description: `${language(from || locale)} capture`,
                  filename: raw.split("/").at(-1),
                },
              ],
            },
            event.currentTarget,
          )
        }
        className="block aspect-[9/16] w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-default"
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className="size-full object-contain"
            onError={() =>
              setFrom(from !== model.reference ? model.reference : null)
            }
          />
        ) : (
          <span className="grid size-full place-items-center p-2 text-center text-[11px] text-muted-foreground">
            Missing
          </span>
        )}
      </button>
      <figcaption className="space-y-0.5 text-[11px] leading-tight">
        <span className="block truncate font-mono" title={raw}>
          {raw.split("/").at(-1)}
        </span>
        {(role || (from && from !== locale)) && (
          <span className="block truncate text-muted-foreground">
            {[role, from && from !== locale ? `${from} fallback` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function CalloutRow({ callout }: { callout: Callout }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
      <span className="font-mono tabular-nums">
        {callout.w}×{callout.h} at {callout.x},{callout.y}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {callout.mag ? `×${callout.mag}` : null}
        {callout.target ? (
          <Status tone="info" className="text-[10px]">
            {callout.targetMode === "element" ? "Element" : "Anchored"}
          </Status>
        ) : (
          <Status className="text-[10px]">Box</Status>
        )}
      </span>
    </li>
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
