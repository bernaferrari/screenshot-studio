import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ErrorNotice } from "@/components/common";
import { errorMessage, mutate } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

/** Confirm removing a project from the workspace; its files stay. */
export function RemoveDialog({
  removing,
  setRemoving,
  refresh,
}: {
  removing: ProjectSummary | null;
  setRemoving(value: ProjectSummary | null): void;
  refresh(): Promise<unknown>;
}) {
  const navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
  );
}
