import { FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage, mutate } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";
import type { ProjectActions } from "./project-dialogs";

/** A project's ⋯ menu: change its folder or name, show it in the file manager, remove it. */
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
