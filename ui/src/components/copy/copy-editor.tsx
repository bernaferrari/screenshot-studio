import { useRef, useState, type MouseEvent } from "react";
import { Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorNotice } from "@/components/common";
import { useMediaViewer } from "@/components/viewer/media-viewer";
import { errorMessage } from "@/lib/api";
import { copyRows, copyScope, writtenFields } from "@/lib/copy";
import { isDirty } from "@/lib/drafts";
import { fieldName, language } from "@/lib/format";
import { artworkMedia } from "@/lib/media";
import {
  copyCard,
  copyKeys,
  type ProjectModel,
  type ProjectSession,
} from "@/lib/project";
import type { Route } from "@/lib/route";
import { ConflictNotice } from "./conflict-notice";
import { CopyCard } from "./copy-card";
import { CopyFilters } from "./copy-filters";
import { CopyHeader } from "./copy-header";
import { CopyPreview } from "./copy-preview";
import { SaveBar } from "./save-bar";

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
    keys = copyKeys(model.galleries, reference).filter(
      (key) => writtenFields(reference, key, translating).length,
    ),
    dirty = isDirty(draft);
  const [query, setQuery] = useState(""),
    [missing, setMissing] = useState(false),
    [feature, setFeature] = useState(keys[0]),
    [focused, setFocused] = useState<string | null>(null),
    sections = useRef(new Map<string, HTMLElement>()),
    areas = useRef(new Map<string, HTMLTextAreaElement>()),
    openViewer = useMediaViewer();
  const preview = feature
    ? copyCard(model, feature, Object.keys(model.galleries)[0])
    : null;
  const openPreview = (event: MouseEvent) => {
    if (!preview) return;
    openViewer(
      {
        items: artworkMedia(model, locale, preview.kind, preview.cards, {
          revision: session.revision(locale),
        }),
        index: preview.index,
        title: "Saved preview",
        notice: dirty
          ? "This preview uses the saved copy. Save your changes to include the latest words."
          : undefined,
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
  const rows = copyRows(keys, reference, copy, translating, {
      query,
      missing,
      focused,
      fieldName,
    }),
    count = rows.reduce((n, row) => n + row.fields.length, 0);
  const clearFilters = () => {
    setQuery("");
    setMissing(false);
  };
  const jump = (key: string) => {
    clearFilters();
    setFeature(key);
    requestAnimationFrame(() => {
      sections.current
        .get(key)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      areas.current.get(key)?.focus({ preventScroll: true });
    });
  };
  const scopeLabel = (key: string) => {
    const scope = copyScope(key);
    return scope
      ? model.profiles[scope]?.label || scope
      : "Shared across galleries";
  };

  return (
    <div className="copy space-y-5" data-reference={!translating}>
      <CopyHeader
        session={session}
        model={model}
        locale={locale}
        route={route}
      />
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
          <SaveBar
            draft={draft}
            dirty={dirty}
            locale={locale}
            onPreview={preview ? openPreview : undefined}
          />
          {draft.conflict && (
            <ConflictNotice
              onResolve={(keep) => session.resolve(locale, keep)}
            />
          )}
          {draft.error && <ErrorNotice message={draft.error} />}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use{" "}
            <code className="rounded bg-muted px-1 py-0.5">*highlight*</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5">~old~</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5">[new]</code>. Enter
            adds a line break.
          </p>
          <CopyFilters
            query={query}
            onQuery={setQuery}
            missing={missing}
            onMissing={setMissing}
            keys={keys}
            onJump={jump}
          />
          <p role="status" className="text-xs text-muted-foreground">
            {count} {count === 1 ? "field" : "fields"} · {language(locale)}
          </p>
          {rows.map(({ key, fields }, i) => (
            <CopyCard
              key={key}
              copyKey={key}
              index={i}
              scope={scopeLabel(key)}
              fields={writtenFields(reference, key, translating)}
              shown={fields}
              locale={locale}
              reference={model.reference}
              words={copy[key]}
              referenceWords={reference[key]}
              onChange={(field, value) =>
                session.edit(locale, key, field, value)
              }
              onFocus={(field) => {
                setFeature(key);
                setFocused(`${key}/${field}`);
              }}
              onBlur={() => setFocused(null)}
              cardRef={(el) => {
                if (el) sections.current.set(key, el);
              }}
              textareaRef={(el) => {
                if (el) areas.current.set(key, el);
              }}
            />
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
                    onClick={clearFilters}
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
            <CopyPreview
              model={model}
              locale={locale}
              kind={preview.kind}
              card={preview.cards[preview.index]}
              index={preview.index}
              revision={session.revision(locale)}
              translating={translating}
              onOpen={openPreview}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
