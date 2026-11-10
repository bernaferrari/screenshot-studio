import type { Copy } from "./types";

/** One language's words while they're edited: the file on disk and the unsaved draft over it. */
export interface Draft {
  data: Copy;
  /** The saved file, as JSON: what the draft is compared with and what a save must still find on disk. */
  saved: string;
  saving: boolean;
  /** Snapshot whose write is in flight; live reload may observe it before the response. */
  pending?: string;
  error: string;
  /** The file changed on disk under an unsaved draft; the person chooses which to keep. */
  conflict: boolean;
  /** The saved file the draft was started from, while in conflict. */
  restoreBase?: string;
}

export const isDirty = (draft: Draft): boolean =>
  JSON.stringify(draft.data) !== draft.saved;

const fresh = (disk: Copy): Draft => ({
  data: disk,
  saved: JSON.stringify(disk),
  saving: false,
  error: "",
  conflict: false,
});

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
      const saved = JSON.stringify(disk);
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
        if (JSON.stringify(cached.data) === saved) {
          storage.removeItem(key(locale));
          return fresh(disk);
        }
        return {
          data: cached.data as Copy,
          saved,
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
  const saved = JSON.stringify(disk);
  if (saved === draft.pending) {
    draft.saved = saved;
    return true;
  }
  if (saved === draft.saved) return false;
  if (!isDirty(draft)) {
    Object.assign(draft, fresh(disk));
    return true;
  }
  if (JSON.stringify(draft.data) === saved) {
    Object.assign(draft, fresh(disk));
    return true;
  }
  draft.restoreBase = draft.conflict ? draft.restoreBase : draft.saved;
  draft.saved = saved;
  draft.conflict = true;
  return true;
}
