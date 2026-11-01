import type { ProjectSummary, WorkspaceData } from "@/lib/types";
import type { Editing } from "@/lib/connect";
import { ConnectDialog } from "./connect-dialog";
import { RemoveDialog } from "./remove-dialog";

export type { Editing } from "@/lib/connect";

/** What the workspace lets a page do with a project. */
export interface ProjectActions {
  capabilities: WorkspaceData["capabilities"];
  edit(project: ProjectSummary): void;
  remove(project: ProjectSummary): void;
}

/** Connect, find, rename and remove projects. */
export function ProjectDialogs({
  editing,
  setEditing,
  removing,
  setRemoving,
  workspace,
  refresh,
}: {
  editing: Editing | null;
  setEditing(value: Editing | null): void;
  removing: ProjectSummary | null;
  setRemoving(value: ProjectSummary | null): void;
  workspace: WorkspaceData;
  refresh(): Promise<unknown>;
}) {
  return (
    <>
      <ConnectDialog
        editing={editing}
        setEditing={setEditing}
        workspace={workspace}
        refresh={refresh}
      />
      <RemoveDialog
        removing={removing}
        setRemoving={setRemoving}
        refresh={refresh}
      />
    </>
  );
}
