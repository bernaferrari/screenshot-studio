import { useCallback, useEffect, useRef, useState } from "react";
import { asset, errorMessage, isAbort, request, sha256 } from "./api";
import {
  createDraftStore,
  isDirty,
  rebase,
  type Draft,
  type DraftStore,
} from "./drafts";
import { classifyChanges, useListingEvents, type LiveState } from "./live";
import type {
  Card,
  Copy,
  Galleries,
  ListingChange,
  Profiles,
  StudioConfig,
} from "./types";

import { cardsFor, requiredCopyFields } from "../../../src/core/gallery";

export {
  cardsFor,
  copyKeys,
  devicesFor,
  followCallout,
  nodesFile,
  outputFile,
} from "../../../src/core/gallery";

/** One project's listing files, as the editor reads them. */
export interface ProjectModel {
  /** The editor's base URL: app files are ../studio.json, ../<locale>/copy.json… */
  base: string;
  config: StudioConfig;
  profiles: Profiles;
  galleries: Galleries;
  /** The default language, which the others fall back to. */
  reference: string;
  locales: string[];
}

interface Revisions {
  /** Bumped when every preview must render again (theme, gallery, reference words). */
  all: number;
  locales: Record<string, number>;
  exports: Record<string, number>;
  storeText: Record<string, number>;
  review: number;
}

export interface ProjectSession {
  model: ProjectModel | null;
  error: string;
  live: LiveState;
  drafts: ReadonlyMap<string, Draft>;
  draft(locale: string): Draft;
  /** Changes when a language's live previews must render again. */
  revision(locale: string): string;
  /** Changes when a language's exported images were rewritten. */
  exportRevision(locale: string): number;
  /** Changes when a language's store text (listing.json) changed. */
  storeTextRevision(locale: string): number;
  /** Changes whenever any file changed: the review runs again. */
  reviewRevision: number;
  edit(locale: string, key: string, field: string, value: string): void;
  /** Settle a conflict: keep the unsaved draft, or take the file on disk. */
  resolve(locale: string, keep: "draft" | "saved"): void;
  save(locale: string): Promise<void>;
  saveGallery(galleries: Galleries, saved: string): Promise<void>;
}

const empty: Draft = {
  data: {},
  saved: "{}",
  saving: false,
  error: "",
  conflict: false,
};
const bumpIn = (record: Record<string, number>, keys: string[]) => {
  const next = { ...record };
  for (const key of keys) next[key] = (next[key] || 0) + 1;
  return next;
};

async function loadListing(base: string, signal?: AbortSignal) {
  const json = <T>(file: string) => request<T>(asset(base, file), { signal });
  const [config, profiles, galleries] = await Promise.all([
    json<StudioConfig>("../studio.json"),
    json<Profiles>("../profiles.json"),
    json<Galleries>("../gallery.json"),
  ]);
  const reference = config.defaultLocale || "en-US";
  const locales = config.locales?.length ? config.locales : [reference];
  return {
    base,
    config,
    profiles: withoutSchema(profiles),
    galleries: withoutSchema(galleries),
    reference,
    locales,
  };
}
const loadCopy = async (
  base: string,
  locale: string,
  signal?: AbortSignal,
): Promise<Copy> =>
  (await request<Copy>(asset(base, `../${locale}/copy.json`), {
    optional: true,
    signal,
  })) || {};
/** Studio files may carry "$schema" for editors; it is not a gallery or a profile. */
function withoutSchema<T extends object>(value: T): T {
  if (!("$schema" in value)) return value;
  const { $schema: _schema, ...rest } = value as Record<string, unknown>;
  return rest as T;
}

/**
 * A studio project open in the editor: its listing files, every language's words with unsaved drafts, and live
 * reload: when files change on disk, the model, drafts and preview revisions follow.
 */
export function useProject(
  base: string,
  projectId: string | null,
  onFilesChanged?: () => void,
): ProjectSession {
  const [model, setModel] = useState<ProjectModel | null>(null),
    [error, setError] = useState(""),
    [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(new Map()),
    [revisions, setRevisions] = useState<Revisions>({
      all: 0,
      locales: {},
      exports: {},
      storeText: {},
      review: 0,
    }),
    current = useRef({ model, drafts }),
    store = useRef<DraftStore>(createDraftStore(base));
  current.current = { model, drafts };

  useEffect(() => {
    const abort = new AbortController();
    store.current = createDraftStore(base);
    setModel(null);
    setError("");
    (async () => {
      const listing = await loadListing(base, abort.signal);
      const copies = await Promise.all(
        listing.locales.map((locale) => loadCopy(base, locale, abort.signal)),
      );
      if (abort.signal.aborted) return;
      const restored = new Map(
        listing.locales.map((locale, i) => [
          locale,
          store.current.restore(locale, copies[i]),
        ]),
      );
      current.current.drafts = restored;
      setDrafts(restored);
      setModel(listing);
    })().catch((e: unknown) => {
      if (!isAbort(e)) setError(errorMessage(e));
    });
    return () => abort.abort();
  }, [base]);

  /** Replace one draft, keep it in the tab, and render. */
  const update = useCallback(
    (locale: string, change: (draft: Draft) => Draft) => {
      const next = change(current.current.drafts.get(locale) || empty);
      const map = new Map(current.current.drafts).set(locale, next);
      current.current.drafts = map;
      try {
        store.current.persist(locale, next);
      } catch {
        next.error =
          "Your browser could not keep this draft. Save before leaving.";
      }
      setDrafts(map);
    },
    [],
  );

  const bump = useCallback(
    (scope: {
      render?: "all" | string[];
      exports?: string[];
      storeText?: string[];
    }) => {
      setRevisions((old) => ({
        all: old.all + (scope.render === "all" ? 1 : 0),
        locales: Array.isArray(scope.render)
          ? bumpIn(old.locales, scope.render)
          : old.locales,
        exports: bumpIn(old.exports, scope.exports || []),
        storeText: bumpIn(old.storeText, scope.storeText || []),
        review: old.review + 1,
      }));
    },
    [],
  );

  const onChange = useCallback(
    async (change: ListingChange | null) => {
      const open = current.current.model;
      if (!open || open.base !== base) return;
      const scope = change
        ? classifyChanges(change.files, open.reference)
        : {
            listing: true,
            copy: open.locales,
            render: "all" as const,
            exports: open.locales,
            storeText: open.locales,
          };
      try {
        if (scope.listing) {
          const listing = await loadListing(base);
          if (current.current.model?.base !== base) return;
          setModel(listing);
          // A new language needs its words too.
          for (const locale of listing.locales)
            if (!current.current.drafts.has(locale)) scope.copy.push(locale);
        }
        for (const locale of new Set(scope.copy)) {
          const disk = await loadCopy(base, locale);
          if (current.current.model?.base !== base) return;
          const existing = current.current.drafts.get(locale);
          if (!existing)
            update(locale, () => store.current.restore(locale, disk));
          else {
            const next = { ...existing };
            if (rebase(next, disk)) update(locale, () => next);
          }
        }
      } catch (e) {
        // A file mid-write can be invalid JSON for a moment; the next change event brings it back.
        if (!isAbort(e)) console.warn("Live reload:", errorMessage(e));
      }
      bump(scope);
      onFilesChanged?.();
    },
    [base, bump, update, onFilesChanged],
  );
  const live = useListingEvents(projectId, onChange);

  const save = useCallback(
    async (locale: string) => {
      const draft = current.current.drafts.get(locale);
      if (!draft || draft.saving || draft.conflict || !isDirty(draft)) return;
      const snapshot = JSON.stringify(draft.data);
      update(locale, (d) => ({ ...d, saving: true, error: "" }));
      try {
        await request(asset(base, `../${locale}/copy.json`), {
          method: "PUT",
          headers: { "X-Studio-Base": await sha256(draft.saved) },
          body: snapshot,
        });
        update(locale, (d) => ({ ...d, saved: snapshot, saving: false }));
        // Without live reload, the previews still need to know.
        if (live !== "live") bump({ render: [locale] });
      } catch (e) {
        update(locale, (d) => ({
          ...d,
          saving: false,
          error: errorMessage(e),
        }));
        throw e;
      }
    },
    [base, bump, live, update],
  );

  const saveGallery = useCallback(
    async (galleries: Galleries, saved: string) => {
      await request(asset(base, "../gallery.json"), {
        method: "PUT",
        headers: { "X-Studio-Base": await sha256(saved) },
        body: JSON.stringify(galleries),
      });
      setModel((old) =>
        old && old.base === base
          ? { ...old, galleries: withoutSchema(galleries) }
          : old,
      );
      if (live !== "live") bump({ render: "all" });
    },
    [base, bump, live],
  );

  const edit = useCallback(
    (locale: string, key: string, field: string, value: string) =>
      update(locale, (d) => ({
        ...d,
        error: "",
        data: { ...d.data, [key]: { ...d.data[key], [field]: value } },
      })),
    [update],
  );
  const resolve = useCallback(
    (locale: string, keep: "draft" | "saved") =>
      update(locale, (d) => ({
        ...d,
        conflict: false,
        restoreBase: undefined,
        data: keep === "saved" ? (JSON.parse(d.saved) as Copy) : d.data,
      })),
    [update],
  );

  const open = model?.base === base ? model : null;
  return {
    model: open,
    error,
    live,
    drafts,
    draft: (locale) => drafts.get(locale) || empty,
    revision: (locale) => `${revisions.all}.${revisions.locales[locale] || 0}`,
    exportRevision: (locale) => revisions.exports[locale] || 0,
    storeTextRevision: (locale) => revisions.storeText[locale] || 0,
    reviewRevision: revisions.review,
    edit,
    resolve,
    save,
    saveGallery,
  };
}

/** How many of the reference's written fields a language has filled in (unsaved words included). */
export function copyCoverage(
  drafts: ReadonlyMap<string, Draft>,
  reference: string,
  locale: string,
  model: Pick<ProjectModel, "galleries" | "profiles">,
): { total: number; translated: number } {
  const base = drafts.get(reference)?.data || {},
    own = drafts.get(locale)?.data || {};
  const fields = requiredCopyFields(model.galleries, model.profiles, base, locale, reference);
  const total = fields.length;
  const translated = fields.filter(({key, field}) => own[key]?.[field]?.trim()).length;
  return { total, translated };
}

/** The copy.json keys a card reads its words from: its feature, then "<gallery>/<feature>" (which wins). */
export const cardCopyKeys = (card: Card, kind: string): string[] =>
  card.sharedCopy === false
    ? [`${kind}/${card.feature}`]
    : [card.feature, `${kind}/${card.feature}`];

/** Where a copy key's words show: its gallery and the card's position there. */
export function copyCard(
  model: ProjectModel,
  key: string,
  fallbackKind: string,
): { kind: string; index: number; cards: Card[] } | null {
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
