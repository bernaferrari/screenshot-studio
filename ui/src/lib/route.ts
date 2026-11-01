import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ProjectSummary, WorkspaceData } from "./types";

/** A studio project's sections. `copy` is one language's words, a page inside Languages. */
export type View = "gallery" | "languages" | "copy" | "review";
export type Source = "live" | "exported";
type Param = string | number | boolean | null | undefined;

export interface Route {
  /** The project in the URL, once the workspace knows it. */
  project: ProjectSummary | undefined;
  id: string | null;
  /** Inside a project's editor (…/store-listing/studio/), rather than the workspace pages. */
  editor: boolean;
  /** The editor's base URL; app files resolve against it (../gallery.json). */
  base: string | undefined;
  view: View;
  locale: string | null;
  kind: string | null;
  source: Source;
  joined: boolean;
  /** The inspected card's position in its gallery. */
  card: number | null;
  /** Show the gallery as a store page. */
  store: boolean;
  /** Change query parameters in place; null removes one. */
  go(changes: Record<string, Param>, options?: { replace?: boolean }): void;
}

const views: Record<string, View> = {
  gallery: "gallery",
  cards: "gallery",
  languages: "languages",
  copy: "copy",
  review: "review",
};

export function useRoute(workspace: WorkspaceData | null): Route {
  const location = useLocation(),
    navigate = useNavigate();
  return useMemo(() => {
    const q = new URLSearchParams(location.search);
    const editor = location.pathname.includes("/store-listing/studio/");
    const id =
      location.pathname.match(/^\/p\/([^/]+)\//)?.[1] ||
      (location.pathname.startsWith("/studio")
        ? q.get("project")
        : workspace?.activeProjectId) ||
      null;
    const project = workspace?.projects.find((p) => p.id === id);
    const base = editor
      ? location.pathname.replace(/index\.html$/, "")
      : project?.editorURL;
    const card = q.get("card");
    return {
      project,
      id,
      editor,
      base,
      view: views[q.get("view") || ""] || "gallery",
      locale: q.get("locale"),
      kind: q.get("kind"),
      source: q.get("source") === "exported" ? "exported" : "live",
      joined: q.get("joined") !== "false",
      card: card !== null && /^\d+$/.test(card) ? Number(card) : null,
      store: q.get("store") === "true",
      go(changes, { replace = false } = {}) {
        const query = new URLSearchParams(location.search);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === undefined) query.delete(key);
          else query.set(key, String(value));
        }
        navigate(`${base}?${query}`, { replace });
      },
    };
  }, [location.pathname, location.search, workspace, navigate]);
}

/** A project's editor, at a section with optional parameters. */
export function editorURL(
  project: Pick<ProjectSummary, "editorURL">,
  view: View = "gallery",
  params: Record<string, Param> = {},
): string {
  const query = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(params))
    if (value !== null && value !== undefined) query.set(key, String(value));
  return `${project.editorURL}?${query}`;
}

/** Where a project opens: a listing in its editor, anything else on its project page. */
export const projectURL = (project: ProjectSummary): string =>
  project.kind === "studio" ? editorURL(project) : project.overviewURL;

/** The section a view belongs to: one language's copy is part of Languages. */
export const sectionOf = (view: View): View =>
  view === "copy" ? "languages" : view;
