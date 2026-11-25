import type { Copy } from "./types";

/** One language's words while they're edited: the file on disk and the unsaved draft over it. */
export interface Draft {
  data: Copy;
  /** The saved copy (without "$schema"), as JSON: what the draft is compared with. */
  saved: string;
  /** The exact file on disk as JSON (including "$schema" when present), hashed for X-Studio-Base. */
  savedRaw?: string;
  /** The file's "$schema" URI, preserved on save without appearing as a copy key. */
  schema?: string;
  saving: boolean;
  /** Clean snapshot whose write is in flight; live reload may observe it before the response. */
  pending?: string;
  error: string;
  /** The file changed on disk under an unsaved draft; the person chooses which to keep. */
  conflict: boolean;
  /** The saved file the draft was started from, while in conflict. */
  restoreBase?: string;
}

/** Separate "$schema" from a copy.json object so the editor only sees copy entries while keeping the file's schema. */
function splitSchema(raw: Copy): {
  data: Copy;
  schema?: string;
  saved: string;
  savedRaw: string;
} {
  if (!raw || typeof raw !== "object" || !("$schema" in raw)) {
    const saved = JSON.stringify(raw);
    return { data: raw, saved, savedRaw: saved };
  }
  const { $schema, ...rest } = raw as Record<string, unknown>;
  const data = rest as Copy;
  return {
    data,
    schema: typeof $schema === "string" ? $schema : undefined,
    saved: JSON.stringify(data),
    savedRaw: JSON.stringify(raw),
  };
}

/** Serialize a draft for PUT ../<locale>/copy.json, restoring "$schema" if the file carried one. */
export const serializeDraft = (draft: Draft): string =>
  JSON.stringify(
    draft.schema ? { $schema: draft.schema, ...draft.data } : draft.data,
  );

export const isDirty = (draft: Draft): boolean =>
  JSON.stringify(draft.data) !== draft.saved;

const fresh = (disk: Copy): Draft => {
  const { data, schema, saved, savedRaw } = splitSchema(disk);
  return {
    data,
    saved,
    savedRaw,
    ...(schema ? { schema } : {}),
    saving: false,
    error: "",
    conflict: false,
  };
};

export interface DraftStore {
  restore(locale: string, disk: Copy): Draft;
  persist(locale: string, draft: Draft): void;
}

/** Keep unsaved words in the tab (sessionStorage) across views, projects and reloads. */
export function createDraftStore(
  scope: string,
  storage: Storage = sessionStorage,
): DraftStore {
  const key = (locale: string) => `studio-draft:${scope}:${locale}`;
  return {
    restore(locale, disk) {
      const { schema, saved, savedRaw } = splitSchema(disk);
      try {
        const cached = JSON.parse(storage.getItem(key(locale)) || "null") as {
          data?: unknown;
          base?: string;
        } | null;
        if (
          !cached?.data ||
          typeof cached.data !== "object" ||
          Array.isArray(cached.data)
        )
          return fresh(disk);
        const cleanCached = splitSchema(cached.data as Copy).data;
        if (JSON.stringify(cleanCached) === saved) {
          storage.removeItem(key(locale));
          return fresh(disk);
        }
        return {
          data: cleanCached,
          saved,
          savedRaw,
          ...(schema ? { schema } : {}),
          saving: false,
          error: "",
          conflict: cached.base !== saved,
          restoreBase: cached.base,
        };
      } catch {
        return fresh(disk);
      }
    },
    persist(locale, draft) {
      if (!isDirty(draft)) storage.removeItem(key(locale));
      else
        storage.setItem(
          key(locale),
          JSON.stringify({
            data: draft.data,
            base: draft.conflict ? draft.restoreBase : draft.saved,
          }),
        );
    },
  };
}

/**
 * The file changed on disk (another editor, an agent, git). A clean draft takes the new words; an unsaved draft
 * keeps its words and asks which to keep. Returns whether anything changed.
 */
export function rebase(draft: Draft, disk: Copy): boolean {
  const { schema, saved, savedRaw } = splitSchema(disk);
  if (saved === draft.pending) {
    draft.saved = saved;
    draft.savedRaw = savedRaw;
    draft.schema = schema;
    return true;
  }
  if (saved === draft.saved && savedRaw === (draft.savedRaw ?? draft.saved))
    return false;
  if (!isDirty(draft)) {
    Object.assign(draft, fresh(disk));
    draft.schema = schema;
    return true;
  }
  if (JSON.stringify(draft.data) === saved) {
    Object.assign(draft, fresh(disk));
    draft.schema = schema;
    return true;
  }
  draft.restoreBase = draft.conflict ? draft.restoreBase : draft.saved;
  draft.saved = saved;
  draft.savedRaw = savedRaw;
  draft.schema = schema;
  draft.conflict = true;
  return true;
}
