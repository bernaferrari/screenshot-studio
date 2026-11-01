import { useEffect, useRef, useState } from "react";
import type { ListingChange } from "./types";

/** What a batch of changed files means for the open editor. */
export interface ChangeScope {
  /** studio.json, profiles.json or gallery.json changed: reload them. */
  listing: boolean;
  /** Languages whose copy.json changed. */
  copy: string[];
  /** Previews to render again: every one, or these languages'. */
  render: "all" | string[];
  /** Languages whose exports changed (the exporter rewrote assets.json). */
  exports: string[];
  /** Languages whose store text (listing.json) changed. */
  storeText: string[];
}

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Sort changed files (relative to store-listing/) by what they affect. The reference language's copy and captures
 * reach every language, since the others fall back to them.
 */
export function classifyChanges(
  files: string[],
  reference: string,
): ChangeScope {
  const scope: ChangeScope = {
    listing: false,
    copy: [],
    render: [],
    exports: [],
    storeText: [],
  };
  const render = (locale: string | "all") => {
    if (scope.render === "all") return;
    if (locale === "all" || locale === reference) scope.render = "all";
    else if (!scope.render.includes(locale)) scope.render.push(locale);
  };
  const add = (list: string[], locale: string) => {
    if (!list.includes(locale)) list.push(locale);
  };
  for (const file of files) {
    const [first, second] = file.split("/");
    if (["studio.json", "profiles.json", "gallery.json"].includes(file)) {
      scope.listing = true;
      render("all");
    } else if (file === "export-report.json") {
      // Only the review reads it.
    } else if (LOCALE.test(first) && second !== undefined) {
      if (second === "copy.json") {
        add(scope.copy, first);
        render(first);
      } else if (second === "assets.json") add(scope.exports, first);
      else if (second === "listing.json") add(scope.storeText, first);
      else render(first);
    } else render("all");
  }
  return scope;
}

export type LiveState = "connecting" | "live" | "offline";

/**
 * Listen to a project's file changes (Server-Sent Events). `onChange` receives each batch; after a lost connection
 * comes back it receives null, meaning anything may have changed.
 */
export function useListingEvents(
  projectId: string | null | undefined,
  onChange: (change: ListingChange | null) => void,
): LiveState {
  const [state, setState] = useState<LiveState>("connecting");
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (!projectId || typeof EventSource === "undefined") {
      setState("offline");
      return;
    }
    const source = new EventSource(
      `/api/projects/${encodeURIComponent(projectId)}/events`,
    );
    let lost = false;
    setState("connecting");
    source.addEventListener("ready", () => {
      setState("live");
      if (lost) handler.current(null);
      lost = false;
    });
    source.addEventListener("change", (event) => {
      try {
        handler.current(
          JSON.parse((event as MessageEvent<string>).data) as ListingChange,
        );
      } catch {
        handler.current(null);
      }
    });
    source.addEventListener("error", () => {
      lost = true;
      setState(
        source.readyState === EventSource.CLOSED ? "offline" : "connecting",
      );
    });
    return () => source.close();
  }, [projectId]);
  return state;
}
