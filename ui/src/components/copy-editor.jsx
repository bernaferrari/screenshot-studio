import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Eye, Type, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { SearchField, Choice, Status, EmptyState, ErrorNotice } from "./common";
import { PreviewCard } from "./preview";
import { artworkMedia, useMediaViewer } from "./media-viewer";
import {
  cardsFor,
  copyKeys,
  pretty,
  language,
  fieldName,
  dirty,
  modifierKey,
} from "@/lib/model";
function CopyPreview({ model, locale, kind, feature }) {
  const container = useRef(null),
    [available, setAvailable] = useState(220);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (container.current?.clientWidth)
        setAvailable(Math.max(100, container.current.clientWidth - 26));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const [scope, name] = feature?.includes("/")
      ? feature.split("/")
      : [kind, feature],
    activeKind = model.galleries[scope] ? scope : kind,
    list = cardsFor(model.galleries, activeKind),
    index = Math.max(
      0,
      list.findIndex((c) => c.feature === name),
    ),
    profile = model.profiles[activeKind],
    height = Math.min(490, (available * profile.height) / profile.width);
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Saved artwork</span>
        <span>{profile.label || pretty(activeKind)}</span>
      </div>
      <div
        ref={container}
        className="flex justify-center overflow-hidden rounded-xl border bg-muted/40 p-3"
      >
        <PreviewCard
          {...{ model, locale }}
          kind={activeKind}
          card={list[index]}
          index={index}
          height={height}
          revision={model.revision}
          viewerItems={artworkMedia(model, locale, activeKind, list)}
          viewerTitle="Saved preview"
          viewerNotice={
            dirty(model.drafts.get(locale))
              ? "This preview uses the saved copy. Save your changes to include the latest words."
              : undefined
          }
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {locale === model.reference
          ? "You’re editing the reference. Other languages use these words until translated."
          : "Empty fields use the reference copy. Save to refresh this preview."}
      </p>
    </div>
  );
}
export function CopyEditor({ session, locale, kind, onSaved }) {
  const { model, persist, save } = session,
    draft = model.drafts.get(locale),
    reference = model.drafts.get(model.reference).data,
    copy = draft.data,
    keys = copyKeys(model.galleries, reference).filter(
      (key) => Object.keys(reference[key] || {}).length,
    );
  const [query, setQuery] = useState(""),
    [missing, setMissing] = useState(false),
    [feature, setFeature] = useState(keys[0]),
    [focusedField, setFocusedField] = useState(null),
    sections = useRef(new Map()),
    areas = useRef(new Map());
  const openViewer = useMediaViewer();
  const openPreview = (event) => {
    const [scope, name] = feature?.includes("/")
        ? feature.split("/")
        : [kind, feature],
      activeKind = model.galleries[scope] ? scope : kind,
      list = cardsFor(model.galleries, activeKind),
      index = Math.max(
        0,
        list.findIndex((card) => card.feature === name),
      );
    openViewer(
      {
        items: artworkMedia(model, locale, activeKind, list),
        index,
        title: "Saved preview",
        notice: dirty(draft)
          ? "This preview uses the saved copy. Save your changes to include the latest words."
          : undefined,
      },
      event.currentTarget,
    );
  };
  const saveCopy = async () => {
    if (!dirty(draft) || draft.saving || draft.conflict) return;
    try {
      await save(locale);
      toast.success(`${language(locale)} copy saved`);
      onSaved?.().catch(() => {});
    } catch (e) {
      toast.error(e.message);
    }
  };
  const rows = keys.map((key) => ({
      key,
      fields: Object.keys(reference[key]).filter(
        (field) =>
          `${key} ${fieldName(field)} ${reference[key][field]} ${copy[key]?.[field] || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!missing ||
            !copy[key]?.[field]?.trim() ||
            focusedField === `${key}/${field}`),
      ),
    })),
    count = rows.reduce((n, row) => n + row.fields.length, 0);
  const choose = (key) => {
    if (!key) return;
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
    <div
      className="copy grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"
      data-reference={locale === model.reference}
    >
      <form
        className="copy-form min-w-0 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveCopy();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            saveCopy();
          } else if (e.key === "Enter" && e.target.type === "search")
            e.preventDefault();
        }}
      >
        <Card className="sticky top-16 z-10 gap-0 border py-0 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span
              role="status"
              className={`flex items-center gap-2 text-xs ${draft.error ? "text-destructive" : dirty(draft) ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}
            >
              {draft.saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : dirty(draft) ? (
                <Type className="size-4" />
              ) : (
                <Check className="size-4" />
              )}
              {draft.saving
                ? "Saving…"
                : dirty(draft)
                  ? "Unsaved · retained in this tab"
                  : "All changes saved"}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {modifierKey} ↵
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="xl:hidden"
                onClick={openPreview}
              >
                <Eye />
                Preview
              </Button>
              <Button
                type="submit"
                size="sm"
                aria-label={`Save ${locale}/copy.json`}
                disabled={!dirty(draft) || draft.saving || draft.conflict}
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
                  onClick={() => {
                    draft.conflict = false;
                    persist(locale);
                  }}
                >
                  Keep my draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    draft.data = JSON.parse(draft.saved);
                    draft.conflict = false;
                    persist(locale);
                  }}
                >
                  Use saved copy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {draft.error && <ErrorNotice message={draft.error} />}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Use <code className="rounded bg-muted px-1 py-0.5">*highlight*</code>,{" "}
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
            onChange={choose}
            items={[
              { value: "_jump", label: "Jump to card…" },
              ...keys.map((key, i) => ({
                value: key,
                label: `${String(i + 1).padStart(2, "0")} · ${pretty(key)}`,
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
            ref={(el) => {
              if (el) sections.current.set(key, el);
            }}
            className="copy-card gap-0 overflow-hidden py-0 shadow-none scroll-mt-36"
          >
            <CardHeader className="flex flex-row items-center gap-3 border-b px-5 py-4">
              <span className="text-xs text-muted-foreground tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <CardTitle className="text-sm">
                {pretty(key.split("/").at(-1))}
              </CardTitle>
              <span className="ml-auto text-right text-xs text-muted-foreground">
                {key.includes("/")
                  ? model.profiles[key.split("/")[0]]?.label ||
                    key.split("/")[0]
                  : "Shared across devices"}
              </span>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {Object.keys(reference[key]).map((field, j) => {
                const value = copy[key]?.[field] ?? "",
                  empty = !value.trim(),
                  id = `${locale}-${key}-${field}`.replace(
                    /[^a-zA-Z0-9_-]/g,
                    "-",
                  );
                return (
                  <section
                    key={field}
                    hidden={!fields.includes(field)}
                    className="copy-field @container/field space-y-3 p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={id}>{fieldName(field)}</Label>
                      {empty ? (
                        <Status id={`${id}-status`} tone="warning">
                          {locale === model.reference
                            ? "Empty reference field"
                            : "Uses reference"}
                        </Status>
                      ) : (
                        <span
                          id={`${id}-status`}
                          className="text-xs text-muted-foreground tabular-nums"
                        >
                          {Array.from(value).length} characters
                        </span>
                      )}
                    </div>
                    <div
                      className={`grid min-w-0 gap-4 ${locale === model.reference ? "" : "@min-[36rem]/field:grid-cols-2"}`}
                    >
                      {locale !== model.reference && (
                        <div className="copy-reference rounded-lg bg-muted/40 p-3">
                          <p className="mb-2 text-xs text-muted-foreground">
                            {language(model.reference)} · reference
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {reference[key][field]}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          {language(locale)}
                        </p>
                        <Textarea
                          id={id}
                          ref={(el) => {
                            if (el && j === 0) areas.current.set(key, el);
                          }}
                          aria-label={`${locale} ${key} ${field}`}
                          aria-describedby={`${id}-status`}
                          dir="auto"
                          lang={locale}
                          value={value}
                          placeholder={
                            locale === model.reference
                              ? `Write ${fieldName(field).toLowerCase()}…`
                              : "Translate the reference…"
                          }
                          rows={
                            field === "body"
                              ? 3
                              : Math.max(2, value.split("\n").length)
                          }
                          className={`resize-y text-base md:text-base ${empty ? "border-amber-500/30 bg-amber-500/5" : ""}`}
                          onFocus={() => {
                            setFeature(key);
                            setFocusedField(`${key}/${field}`);
                          }}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => {
                            (draft.data[key] ||= {})[field] = e.target.value;
                            draft.error = "";
                            persist(locale);
                          }}
                        />
                      </div>
                    </div>
                  </section>
                );
              })}
            </CardContent>
          </Card>
        ))}
        {!count && (
          <EmptyState
            title="No matching copy"
            description="Try another phrase, or show every field."
            icon={Type}
            action={
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
            }
          />
        )}
      </form>
      <aside className="hidden min-w-0 xl:sticky xl:top-20 xl:block">
        <CopyPreview {...{ model, locale, kind, feature }} />
      </aside>
    </div>
  );
}
