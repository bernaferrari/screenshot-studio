// The Connect your projects dialog's form, apart from the DOM.
import type { Discovery, ProjectSummary } from "./types";

/** The project being edited; an empty object adds a new one. */
export type Editing = Partial<Pick<ProjectSummary, "id" | "root" | "name">>;

export interface ConnectForm {
  /** Add one folder, or find projects inside one. */
  mode: "add" | "find";
  root: string;
  name: string;
  /** What Find projects found, until the folder changes. */
  found: Discovery | null;
  /** The found folders to connect. */
  selected: ReadonlySet<string>;
}

export type ConnectEvent =
  | { type: "open"; editing: Editing }
  | { type: "mode"; mode: ConnectForm["mode"]; searchRoot?: string }
  | { type: "root"; root: string }
  | { type: "name"; name: string }
  | { type: "found"; found: Discovery }
  | { type: "select"; root: string; selected: boolean };

export const openForm = (editing: Editing): ConnectForm => ({
  mode: "add",
  root: editing.root || "",
  name: editing.name || "",
  found: null,
  selected: new Set(),
});

export function connectReducer(
  form: ConnectForm,
  event: ConnectEvent,
): ConnectForm {
  switch (event.type) {
    case "open":
      return openForm(event.editing);
    case "mode":
      // Finding starts in the usual projects folder.
      return {
        ...form,
        mode: event.mode,
        found: null,
        root:
          event.mode === "find" && !form.root
            ? event.searchRoot || ""
            : form.root,
      };
    case "root":
      return { ...form, root: event.root, found: null };
    case "name":
      return { ...form, name: event.name };
    case "found":
      // Everything not yet connected starts selected.
      return {
        ...form,
        found: event.found,
        selected: new Set(
          event.found.projects
            .filter((p) => !p.registeredId)
            .map((p) => p.root),
        ),
      };
    case "select": {
      const selected = new Set(form.selected);
      if (event.selected) selected.add(event.root);
      else selected.delete(event.root);
      return { ...form, selected };
    }
  }
}

/** The submit button's words for where the form stands. */
export function submitLabel(
  form: ConnectForm,
  editing: boolean,
  busy: boolean,
): string {
  if (busy) return "Working…";
  if (editing) return "Save project";
  if (form.mode === "add") return "Add project";
  return form.found ? `Add ${form.selected.size} projects` : "Find projects";
}
