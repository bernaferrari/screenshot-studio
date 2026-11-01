import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorNotice, Status } from "./common";
import { errorMessage, mutate } from "@/lib/api";
import type {
  Discovery,
  ProjectsChanged,
  ProjectSummary,
  WorkspaceData,
} from "@/lib/types";

/** What the workspace lets a page do with a project. */
export interface ProjectActions {
  capabilities: WorkspaceData["capabilities"];
  edit(project: ProjectSummary): void;
  remove(project: ProjectSummary): void;
}
/** The project being edited; an empty object adds a new one. */
export type Editing = Partial<Pick<ProjectSummary, "id" | "root" | "name">>;

export function ProjectMenu({
  project,
  actions,
}: {
  project: ProjectSummary;
  actions: ProjectActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Manage ${project.name}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.edit(project)}>
          <Pencil />
          Change folder or name
        </DropdownMenuItem>
        {actions.capabilities.revealFolder && (
          <DropdownMenuItem
            onSelect={() =>
              mutate(`/api/projects/${project.id}/reveal`, {}).catch(
                (e: unknown) => toast.error(errorMessage(e)),
              )
            }
          >
            <FolderOpen />
            Show in file manager
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => actions.remove(project)}
        >
          <Trash2 />
          Remove from workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const navigate = useNavigate(),
    [mode, setMode] = useState<"add" | "find">("add"),
    [root, setRoot] = useState(""),
    [name, setName] = useState(""),
    [found, setFound] = useState<Discovery | null>(null),
    [selected, setSelected] = useState(new Set<string>()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!editing) return;
    setMode("add");
    setRoot(editing.root || "");
    setName(editing.name || "");
    setFound(null);
    setSelected(new Set());
    setError("");
  }, [editing]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "find" && !found) {
        const result = await mutate<Discovery>("/api/projects/discover", {
          root,
        });
        setFound(result);
        setSelected(
          new Set(
            result.projects.filter((p) => !p.registeredId).map((p) => p.root),
          ),
        );
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
      if (picked.path) {
        setRoot(picked.path);
        setFound(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPicking(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      await mutate(`/api/projects/${removing.id}`, undefined, "DELETE");
      await refresh();
      setRemoving(null);
      navigate("/studio/");
      toast.success("Project removed. Its files stay in place.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
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
              Add an app repository or screenshot folder. Existing Studio
              listings open in the editor; other folders become image libraries.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            {!editing?.id && (
              <Tabs
                value={mode}
                onValueChange={(value) => {
                  setMode(value as "add" | "find");
                  setFound(null);
                  setError("");
                  if (value === "find" && !root)
                    setRoot(workspace.defaultSearchRoot || "");
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
              <Label htmlFor="project-folder">
                {mode === "find" ? "Search inside folder" : "Project folder"}
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="project-folder"
                  aria-label={
                    mode === "find" ? "Search inside folder" : "Project folder"
                  }
                  value={root}
                  onChange={(e) => {
                    setRoot(e.target.value);
                    setFound(null);
                  }}
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Use the app or folder name"
                />
              </div>
            )}
            {found && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {found.projects.length} projects found
                </p>
                <ScrollArea className="max-h-64 rounded-md border">
                  <div className="space-y-1 p-2">
                    {found.projects.map((p) => (
                      <Label
                        key={p.root}
                        className="flex cursor-pointer items-center gap-3 rounded-md p-3 hover:bg-accent"
                      >
                        <Checkbox
                          checked={selected.has(p.root)}
                          disabled={!!p.registeredId}
                          onCheckedChange={(checked) =>
                            setSelected((old) => {
                              const next = new Set(old);
                              if (checked === true) next.add(p.root);
                              else next.delete(p.root);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{p.name}</span>
                          <span className="mt-1 block text-xs leading-relaxed font-normal break-all text-muted-foreground">
                            {p.root}
                          </span>
                        </span>
                        <Status>
                          {p.registeredId
                            ? "Connected"
                            : p.kind === "studio"
                              ? "Studio"
                              : "Library"}
                        </Status>
                      </Label>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {found.truncated
                    ? "The search reached its folder limit. Search a smaller parent folder to find more."
                    : "Only selected folders will be connected. Your project files stay in place."}
                </p>
              </div>
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
                disabled={
                  busy || (mode === "find" && !!found && !selected.size)
                }
              >
                {busy && <Loader2 className="animate-spin" />}
                {busy
                  ? "Working…"
                  : editing?.id
                    ? "Save project"
                    : mode === "add"
                      ? "Add project"
                      : found
                        ? `Add ${selected.size} projects`
                        : "Find projects"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRemoving(null);
            setError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name} will leave this workspace. Its screenshots and
              files stay in their folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <ErrorNotice message={error} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove from workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
