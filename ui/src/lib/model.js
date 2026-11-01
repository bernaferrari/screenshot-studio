import { useCallback, useEffect, useRef, useState } from "react";
import { createDraftStore } from "./editor-drafts";
export {
  cardsFor,
  devicesFor,
  copyKeys,
  outputFile,
  nodesFile,
  followCallout,
} from "../../../src/core/gallery";
export const modifierKey = /Mac|iPhone|iPad/.test(navigator.platform)
  ? "⌘"
  : "Ctrl";
export const pretty = (text) =>
  String(text || "")
    .replace(/^\d+[-/]/, "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
const names = new Intl.DisplayNames(["en"], { type: "language" });
export const language = (code) => {
  try {
    return names.of(code) || code;
  } catch {
    return code;
  }
};
export const fieldName = (field) =>
  ({
    title: "Headline",
    body: "Supporting text",
    alt: "Image description",
    commit: "Timeline label",
    note: "Note",
  })[field] || pretty(field);
export async function request(url, { optional = false, ...options } = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    if (optional && response.status === 404) return null;
    let message;
    try {
      message = (await response.json()).error;
    } catch {}
    throw Error(
      message ||
        `Could not ${options.method === "PUT" ? "save" : "load"} ${new URL(url, location.href).pathname}`,
    );
  }
  return response.status === 204 ? null : response.json();
}
export const mutate = (url, body, method = "POST") =>
  request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
export const asset = (base, file) =>
  new URL(file, new URL(base, location.origin)).href;
export function useWorkspace() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const value = await request("/api/workspace", { optional: true });
      setData(value || { projects: [], standalone: true, capabilities: {} });
      setError("");
      return value;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  return { data, error, loading, refresh };
}
export function useProject(base) {
  const [model, setModel] = useState(null),
    [error, setError] = useState(""),
    [version, rerender] = useState(0),
    revision = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    (async () => {
      const json = (file) =>
        request(asset(base, file), { signal: abort.signal });
      const [config, profiles, galleries] = await Promise.all([
        json("../studio.json"),
        json("../profiles.json"),
        json("../gallery.json"),
      ]);
      const reference = config.defaultLocale || "en-US",
        locales = config.locales || [reference],
        store = createDraftStore(base);
      const drafts = new Map(
        await Promise.all(
          locales.map(async (locale) => {
            const copy =
              (await request(asset(base, `../${locale}/copy.json`), {
                optional: true,
                signal: abort.signal,
              })) || {};
            return [locale, store.restore(locale, copy)];
          }),
        ),
      );
      if (abort.signal.aborted) return;
      setModel({
        base,
        config,
        profiles,
        galleries,
        reference,
        locales,
        drafts,
        store,
        revision: 0,
      });
    })().catch((e) => {
      if (e.name !== "AbortError") setError(e.message);
    });
    return () => abort.abort();
  }, [base]);
  const touch = useCallback(() => rerender((v) => v + 1), []);
  const persist = useCallback(
    (locale) => {
      const draft = model.drafts.get(locale);
      try {
        model.store.persist(locale, draft);
      } catch {
        draft.error =
          "Your browser could not retain this draft. Save before leaving.";
      }
      touch();
    },
    [model, touch],
  );
  const save = useCallback(
    async (locale) => {
      const draft = model.drafts.get(locale);
      if (draft.saving || draft.conflict) return;
      const snapshot = JSON.stringify(draft.data);
      draft.saving = true;
      draft.error = "";
      touch();
      try {
        await request(asset(base, `../${locale}/copy.json`), {
          method: "PUT",
          headers: { "X-Studio-Base": Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(draft.saved))), byte => byte.toString(16).padStart(2, "0")).join("") },
          body: snapshot,
        });
        draft.saved = snapshot;
        model.revision = ++revision.current;
        persist(locale);
      } catch (e) {
        draft.error = e.message;
        throw e;
      } finally {
        draft.saving = false;
        touch();
      }
    },
    [base, model, persist, touch],
  );
  const saveGallery = useCallback(
    async (galleries) => {
      await mutate(asset(base, "../gallery.json"), galleries, "PUT");
      model.galleries = galleries;
      model.revision = ++revision.current;
      touch();
    },
    [base, model, touch],
  );
  return {
    model: model?.base === base ? model : null,
    error,
    version,
    persist,
    save,
    saveGallery,
    touch,
  };
}
export const dirty = (draft) => JSON.stringify(draft.data) !== draft.saved;
export function coverage(model, locale) {
  const reference = model.drafts.get(model.reference).data,
    own = model.drafts.get(locale).data,
    fields = Object.entries(reference).flatMap(([key, value]) =>
      Object.keys(value).map((field) => ({ key, field })),
    );
  return {
    total: fields.length,
    translated: fields.filter(({ key, field }) => own[key]?.[field]?.trim())
      .length,
  };
}
export function useRoute(location, navigate, workspace) {
  const q = new URLSearchParams(location.search),
    id =
      location.pathname.match(/^\/p\/([^/]+)\//)?.[1] ||
      (location.pathname.startsWith("/studio")
        ? q.get("project")
        : workspace?.activeProjectId),
    project = workspace?.projects?.find((p) => p.id === id),
    editor = location.pathname.includes("/store-listing/studio/");
  const base = editor
    ? location.pathname.replace(/index\.html$/, "")
    : project?.editorURL;
  const go = (changes, { replace = false } = {}) => {
    const query = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(changes))
      query.set(key, String(value));
    navigate(`${base}?${query}`, { replace });
  };
  return {
    project,
    id,
    editor,
    base,
    view: ["cards", "languages", "copy"].includes(q.get("view"))
      ? q.get("view")
      : "cards",
    locale: q.get("locale"),
    kind: q.get("kind"),
    source: q.get("source") === "exported" ? "exported" : "live",
    joined: q.get("joined") !== "false",
    go,
  };
}
export const editorURL = (project, view = "cards", locale, kind) =>
  `${project.editorURL}?view=${view}${locale ? `&locale=${encodeURIComponent(locale)}` : ""}${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`;
