import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, FolderOpen, Image } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorNotice, IconButton, PageHeading } from "./common";
import type { ProjectActions } from "./projects/project-dialogs";
import { ProjectMenu } from "./projects/project-menu";
import { useMediaViewer } from "./viewer/media-viewer";
import { errorMessage, isAbort, request } from "@/lib/api";
import { copyText } from "@/lib/format";
import type { LibraryFiles, ProjectSummary } from "@/lib/types";

/** A connected folder without a Studio listing: its images, or how to reconnect it. */
export function ProjectPage({
  project,
  actions,
}: {
  project: ProjectSummary;
  actions: ProjectActions;
}) {
  const openViewer = useMediaViewer();
  const [files, setFiles] = useState<LibraryFiles | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setFiles(null);
    setError("");
    if (project.kind !== "library") return;
    const abort = new AbortController();
    request<LibraryFiles>(`/api/projects/${project.id}/files`, {
      signal: abort.signal,
    })
      .then(setFiles)
      .catch((e: unknown) => {
        if (!isAbort(e)) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [project.id, project.kind]);
  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={project.kind === "library" ? "Screenshot library" : "Project"}
        title={project.name}
        description={
          project.kind === "library"
            ? "This folder has no Studio listing yet. Browse its images here; set up a listing to make store art from them."
            : "This project needs attention before it can open."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/studio/">
                <ArrowLeft />
                All projects
              </Link>
            </Button>
            <ProjectMenu project={project} actions={actions} />
          </>
        }
      />
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
        <FolderOpen className="size-4 shrink-0" />
        <code className="min-w-0 flex-1 truncate" title={project.root}>
          {project.displayRoot}
        </code>
        <IconButton
          label="Copy project folder"
          onClick={() =>
            copyText(project.root)
              .then(() => toast.success("Project folder copied"))
              .catch((e: unknown) => toast.error(errorMessage(e)))
          }
        >
          <Copy />
        </IconButton>
      </div>
      {project.kind !== "library" ? (
        <EmptyState
          title="Let’s reconnect this project"
          description={
            "problem" in project
              ? project.problem
              : "This project could not be read."
          }
          action={
            <Button onClick={() => actions.edit(project)}>Change folder</Button>
          }
        />
      ) : error ? (
        <ErrorNotice message={error} />
      ) : !files ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : files.files.length ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">
            {files.files.length}
            {files.truncated ? "+" : ""} images
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {files.files.map((file, index) => (
              <Button
                type="button"
                variant="ghost"
                key={file.file}
                aria-label={`Enlarge ${file.file}`}
                onClick={(event) =>
                  openViewer(
                    {
                      items: files.files.map((image) => ({
                        id: image.file,
                        type: "image",
                        src: image.url,
                        title: image.file,
                        description: project.name,
                        filename: image.file.split("/").at(-1),
                      })),
                      index,
                      title: `${project.name} screenshots`,
                    },
                    event.currentTarget,
                  )
                }
                className="library-image block h-auto min-w-0 cursor-zoom-in rounded-xl p-0 text-left whitespace-normal focus-visible:ring-offset-4"
              >
                <Card className="gap-0 overflow-hidden py-0 shadow-none">
                  <img
                    src={file.url}
                    alt={file.file}
                    loading="lazy"
                    draggable={false}
                    className="h-52 w-full bg-muted object-contain p-4"
                  />
                  <CardContent className="p-3 text-xs break-all text-muted-foreground">
                    {file.file}
                  </CardContent>
                </Card>
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={Image}
          title="No screenshots yet"
          description="Add images to this folder and refresh the overview."
        />
      )}
    </div>
  );
}
