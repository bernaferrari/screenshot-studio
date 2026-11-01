import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorNotice } from "@/components/common";
import { errorMessage, mutate } from "@/lib/api";
import {
  connectReducer,
  openForm,
  submitLabel,
  type Editing,
} from "@/lib/connect";
import type { Discovery, ProjectsChanged, WorkspaceData } from "@/lib/types";
import { FoundProjects } from "./found-projects";

/** Add a folder, find projects inside one, or change a project's folder and name. */
export function ConnectDialog({
  editing,
  setEditing,
  workspace,
  refresh,
}: {
  editing: Editing | null;
  setEditing(value: Editing | null): void;
  workspace: WorkspaceData;
  refresh(): Promise<unknown>;
}) {
  const navigate = useNavigate(),
    [form, dispatch] = useReducer(connectReducer, {}, openForm),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [picking, setPicking] = useState(false),
    { mode, root, name, found, selected } = form,
    folderLabel = mode === "find" ? "Search inside folder" : "Project folder";
  useEffect(() => {
    if (!editing) return;
    dispatch({ type: "open", editing });
    setError("");
  }, [editing]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "find" && !found) {
        dispatch({
          type: "found",
          found: await mutate<Discovery>("/api/projects/discover", { root }),
        });
        return;
      }
      const result = editing.id
        ? await mutate<ProjectsChanged>(
            `/api/projects/${editing.id}`,
            { root, name },
            "PATCH",
          )
        : mode === "find"
          ? await mutate<ProjectsChanged>("/api/projects/import", {
              roots: [...selected],
            })
          : await mutate<ProjectsChanged>("/api/projects", { root, name });
      await refresh();
      setEditing(null);
      navigate(
        mode === "find"
          ? "/studio/"
          : `/studio/?project=${editing.id || result.added?.[0]}`,
      );
      toast.success(editing.id ? "Project updated" : "Projects connected");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    setPicking(true);
    setError("");
    try {
      const picked = await mutate<{ path: string | null }>(
        "/api/workspace/pick-folder",
        {},
      );
      if (picked.path) dispatch({ type: "root", root: picked.path });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPicking(false);
    }
  };
  return (
    <Dialog
      open={!!editing}
      onOpenChange={(open) => !open && !busy && setEditing(null)}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing?.id ? "Project settings" : "Connect your projects"}
          </DialogTitle>
          <DialogDescription>
            Add an app repository or screenshot folder. Existing Studio listings
            open in the editor; other folders become image libraries.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          {!editing?.id && (
            <Tabs
              value={mode}
              onValueChange={(value) => {
                dispatch({
                  type: "mode",
                  mode: value as "add" | "find",
                  searchRoot: workspace.defaultSearchRoot,
                });
                setError("");
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="add" className="flex-1">
                  <FolderOpen />
                  Add a folder
                </TabsTrigger>
                <TabsTrigger value="find" className="flex-1">
                  <Search />
                  Find projects
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="space-y-2">
            <Label htmlFor="project-folder">{folderLabel}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="project-folder"
                aria-label={folderLabel}
                value={root}
                onChange={(e) =>
                  dispatch({ type: "root", root: e.target.value })
                }
                placeholder="~/Documents/my-app"
                required
                autoComplete="off"
                spellCheck={false}
                className="min-w-40 flex-1"
              />
              {workspace.capabilities.folderPicker && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={choose}
                  disabled={picking || busy}
                >
                  {picking ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FolderOpen />
                  )}
                  Choose folder
                </Button>
              )}
            </div>
          </div>
          {mode === "add" && (
            <div className="space-y-2">
              <Label htmlFor="project-name">
                Project name{" "}
                <span className="font-normal text-muted-foreground">
                  optional
                </span>
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) =>
                  dispatch({ type: "name", name: e.target.value })
                }
                placeholder="Use the app or folder name"
              />
            </div>
          )}
          {found && (
            <FoundProjects
              found={found}
              selected={selected}
              onSelect={(root, selected) =>
                dispatch({ type: "select", root, selected })
              }
            />
          )}
          {error && <ErrorNotice message={error} />}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (mode === "find" && !!found && !selected.size)}
            >
              {busy && <Loader2 className="animate-spin" />}
              {submitLabel(form, !!editing?.id, busy)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
