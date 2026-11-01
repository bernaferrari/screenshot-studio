import { useRef, useState, type MouseEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  Loader2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Choice, EmptyState, ErrorNotice, Kbd, SearchField } from "./common";
import { CopyField } from "./copy-field";
import { CardFrame } from "./gallery/card-frame";
import { artworkMedia, useMediaViewer } from "./media-viewer";
import { errorMessage } from "@/lib/api";
import { isDirty } from "@/lib/drafts";
import {
  fieldName,
  language,
  modifierKey,
  position,
  pretty,
} from "@/lib/format";
import {
  cardsFor,
  copyCoverage,
  copyKeys,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

/** Where a copy key's words show: its gallery and the card's position there. */
function cardFor(model: ProjectModel, key: string, fallbackKind: string) {
  const [scope, name] = key.includes("/")
    ? key.split("/")
    : [fallbackKind, key];
  for (const kind of [scope, ...Object.keys(model.galleries)]) {
    if (!model.galleries[kind]) continue;
    const cards = cardsFor(model.galleries, kind),
      index = cards.findIndex((card) => card.feature === name);
    if (index >= 0) return { kind, index, cards };
  }
  return null;
}

/** Every card's words in one language, beside the reference, with the saved card previewed alongside. */
export function CopyEditor({
  session,
  model,
  locale,
  route,
}: {
  session: ProjectSession;
  model: ProjectModel;
  locale: string;
  route: Route;
}) {
  const draft = session.draft(locale),
    reference = session.draft(model.reference).data,
    copy = draft.data,
    translating = locale !== model.reference,
    // A translation shows only what the reference writes; the reference shows every field, empty ones too.
    written = (key: string) =>
      Object.keys(reference[key] || {}).filter(
        (field) => !translating || reference[key][field]?.trim(),
      ),
    keys = copyKeys(model.galleries, reference).filter(
      (key) => written(key).length,
    ),
    dirty = isDirty(draft),
    coverage = copyCoverage(session.drafts, model.reference, locale);
  const [query, setQuery] = useState(""),
    [missing, setMissing] = useState(false),
    [feature, setFeature] = useState(keys[0]),
    [focused, setFocused] = useState<string | null>(null),
    sections = useRef(new Map<string, HTMLElement>()),
    areas = useRef(new Map<string, HTMLTextAreaElement>()),
    openViewer = useMediaViewer();
  const preview = feature
    ? cardFor(model, feature, Object.keys(model.galleries)[0])
    : null;
  const unsavedNotice = dirty
    ? "This preview uses the saved copy. Save your changes to include the latest words."
    : undefined;
  const openPreview = (event: MouseEvent) => {
    if (!preview) return;
    openViewer(
      {
        items: artworkMedia(model, locale, preview.kind, preview.cards, {
          revision: session.revision(locale),
        }),
        index: preview.index,
        title: "Saved preview",
        notice: unsavedNotice,
      },
      event.currentTarget,
    );
  };
  const save = async () => {
    if (!dirty || draft.saving || draft.conflict) return;
    try {
      await session.save(locale);
      toast.success(`${language(locale)} copy saved`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const needle = query.toLowerCase();
  const rows = keys.map((key) => ({
      key,
      fields: written(key).filter(
        (field) =>
          `${key} ${fieldName(field)} ${reference[key][field]} ${copy[key]?.[field] || ""}`
            .toLowerCase()
            .includes(needle) &&
          (!missing ||
            !copy[key]?.[field]?.trim() ||
            focused === `${key}/${field}`),
      ),
    })),
    count = rows.reduce((n, row) => n + row.fields.length, 0);
  const jump = (key: string) => {
    setQuery("");
    setMissing(false);
    setFeature(key);
    requestAnimationFrame(() => {
      sections.current
        .get(key)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      areas.current.get(key)?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="copy space-y-5" data-reference={!translating}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => route.go({ view: "languages", locale: null })}
        >
          <ArrowLeft />
          All languages
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {coverage.translated} / {coverage.total} fields
          </span>
          <Choice
            label="Language"
            value={locale}
            onChange={(next) => route.go({ locale: next })}
            items={model.locales.map((code) => ({
              value: code,
              label: `${language(code)}${code === model.reference ? " · reference" : ""}`,
            }))}
            className="w-56"
          />
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form
          className="copy-form min-w-0 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (
              e.key === "Enter" &&
              e.target instanceof HTMLInputElement &&
              e.target.type === "search"
            )
              e.preventDefault();
          }}
        >
          <Card className="sticky top-16 z-10 gap-0 border py-0 shadow-sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span
                role="status"
                className={cn(
                  "flex items-center gap-2 text-xs",
                  draft.error
                    ? "text-destructive"
                    : dirty
                      ? "text-amber-800 dark:text-amber-300"
                      : "text-muted-foreground",
                )}
              >
                {draft.saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : dirty ? (
                  <Type className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
                {draft.saving
                  ? "Saving…"
                  : dirty
                    ? "Unsaved · kept in this tab"
                    : "All changes saved"}
              </span>
              <div className="flex items-center gap-2">
                <Kbd className="hidden lg:inline-flex">{modifierKey} ↵</Kbd>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="xl:hidden"
                  onClick={openPreview}
                  disabled={!preview}
                >
                  <Eye />
                  Preview
                </Button>
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
                  Save copy
                </Button>
              </div>
            </CardContent>
          </Card>
          {draft.conflict && (
            <Alert className="border-amber-500/30">
              <AlertTriangle />
              <AlertTitle>The saved copy changed</AlertTitle>
              <AlertDescription>
                This draft was based on an earlier file. Choose which version to
                keep.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => session.resolve(locale, "draft")}
                  >
                    Keep my draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => session.resolve(locale, "saved")}
                  >
                    Use saved copy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {draft.error && <ErrorNotice message={draft.error} />}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1 py-0.5">*highlight*</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">~old~</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5">[new]</code>. Enter
            adds a line break.
          </p>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-48 flex-1">
              <SearchField
                label="Search copy"
                value={query}
                onChange={setQuery}
                placeholder="Find a card or phrase…"
              />
            </div>
            <Toggle
              pressed={missing}
              onPressedChange={setMissing}
              variant="outline"
              aria-label="Missing only"
            >
              Missing only
            </Toggle>
            <Choice
              label="Jump to copy card"
              value="_jump"
              onChange={(key) => key !== "_jump" && jump(key)}
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
          <p role="status" className="text-xs text-muted-foreground">
            {count} {count === 1 ? "field" : "fields"} · {language(locale)}
          </p>
          {rows.map(({ key, fields }, i) => (
            <Card
              key={key}
              hidden={!fields.length}
              ref={(el: HTMLDivElement | null) => {
                if (el) sections.current.set(key, el);
              }}
              className="copy-card scroll-mt-36 gap-0 overflow-hidden py-0 shadow-none"
            >
              <CardHeader className="flex flex-row items-center gap-3 border-b px-5 py-3.5">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {position(i)}
                </span>
                <CardTitle className="text-sm">
                  {pretty(key.split("/").at(-1))}
                </CardTitle>
                <span className="ml-auto text-right text-xs text-muted-foreground">
                  {key.includes("/")
                    ? model.profiles[key.split("/")[0]]?.label ||
                      key.split("/")[0]
                    : "Shared across galleries"}
                </span>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {written(key).map((field, j) => (
                  <section
                    key={field}
                    hidden={!fields.includes(field)}
                    className="p-4 sm:p-5"
                  >
                    <CopyField
                      locale={locale}
                      reference={model.reference}
                      copyKey={key}
                      field={field}
                      value={copy[key]?.[field] ?? ""}
                      referenceText={reference[key][field]}
                      onChange={(value) =>
                        session.edit(locale, key, field, value)
                      }
                      onFocus={() => {
                        setFeature(key);
                        setFocused(`${key}/${field}`);
                      }}
                      onBlur={() => setFocused(null)}
                      textareaRef={(el) => {
                        if (el && j === 0) areas.current.set(key, el);
                      }}
                    />
                  </section>
                ))}
              </CardContent>
            </Card>
          ))}
          {!count && (
            <EmptyState
              title={keys.length ? "No matching copy" : "No words yet"}
              description={
                keys.length
                  ? "Try another phrase, or show every field."
                  : `Add words for your cards to ${model.reference}/copy.json, or write them in the card inspector in Gallery.`
              }
              icon={Type}
              action={
                keys.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setMissing(false);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </form>
        <aside className="hidden min-w-0 xl:sticky xl:top-20 xl:block">
          {preview && (
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Saved artwork</span>
                <span>
                  {model.profiles[preview.kind].label || pretty(preview.kind)}
                </span>
              </div>
              <button
                type="button"
                onClick={openPreview}
                aria-label={`Enlarge ${pretty(preview.cards[preview.index].feature)} preview`}
                className="flex w-full cursor-zoom-in justify-center rounded-xl border bg-muted/40 p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
              >
                <CardFrame
                  model={model}
                  locale={locale}
                  kind={preview.kind}
                  card={preview.cards[preview.index]}
                  index={preview.index}
                  height={Math.min(
                    480,
                    (274 * model.profiles[preview.kind].height) /
                      model.profiles[preview.kind].width,
                  )}
                  source="live"
                  revision={session.revision(locale)}
                />
              </button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {translating
                  ? "Empty fields use the reference. The preview updates when you save."
                  : "You're editing the reference. Other languages use these words until translated."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
