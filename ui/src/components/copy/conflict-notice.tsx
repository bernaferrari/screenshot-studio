import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** The file changed on disk under an unsaved draft: keep the draft or take the file. */
export function ConflictNotice({
  onResolve,
}: {
  onResolve(keep: "draft" | "saved"): void;
}) {
  return (
    <Alert className="border-amber-500/30">
      <AlertTriangle />
      <AlertTitle>The saved copy changed</AlertTitle>
      <AlertDescription>
        This draft was based on an earlier file. Choose which version to keep.
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onResolve("draft")}>
            Keep my draft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onResolve("saved")}
          >
            Use saved copy
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
