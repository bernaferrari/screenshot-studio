import { useEffect, useState } from "react";
import { useMediaViewer } from "./media-viewer";
import { Link } from "react-router-dom";
import {
  Plus,
  ArrowRight,
  RefreshCw,
  FolderOpen,
  Image,
  Copy,
  Globe2,
  Layers,
  CheckCheck,
  Download,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeading,
  Metrics,
  Status,
  Filmstrip,
  ProjectAvatar,
  SearchField,
  EmptyState,
  ErrorNotice,
  IconButton,
} from "./common";
import { StudioProjectOverview } from "./project-overview";
import { ProjectMenu } from "./project-dialogs";
import { editorURL, request } from "@/lib/model";
function ProjectCard({ project, onEdit, onRemove, workspace }) {
  const studio = project.kind === "studio";
  const remaining = studio
    ? project.locales.length - project.completeLocales
    : 0;
  return (
    <Card className="workspace-card gap-0 overflow-hidden py-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <Link
          to={project.overviewURL}
          className="group flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ProjectAvatar project={project} className="size-10" />
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="truncate text-sm group-hover:underline underline-offset-4">
              {project.name}
            </CardTitle>
            <CardDescription className="text-xs">
              {studio
                ? `${project.cardCount} cards · ${project.galleries.length} galleries`
                : project.kind === "library"
                  ? "Screenshot library"
                  : "Setup needed"}
            </CardDescription>
          </div>
        </Link>
        <ProjectMenu
          {...{
            project,
            onEdit,
            onRemove,
            capabilities: workspace.capabilities,
          }}
        />
      </CardHeader>
      <Filmstrip project={project} />
      <CardContent className="flex-1 space-y-4 px-5 py-4">
        {studio ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Globe2 className="size-3.5" />
                Languages
              </span>
              <span className="font-medium tabular-nums">
                {project.completeLocales} / {project.locales.length} complete
              </span>
            </div>
            <Progress
              value={
                project.locales.length
                  ? (project.completeLocales / project.locales.length) * 100
                  : 0
              }
              className="h-1"
              aria-label={`${project.name} complete language asset sets`}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <Status tone={remaining ? "muted" : "success"}>
                {remaining
                  ? `${remaining} languages to finish`
                  : "Assets complete"}
              </Status>
              <span className="tabular-nums">
                {project.totals.captures} / {project.totals.expectedCaptures}{" "}
                captures
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {project.problem ||
              `${project.imageCount}${project.truncated ? "+" : ""} images found in this folder.`}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t bg-muted/20 px-5 py-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
        >
          <Link to={project.overviewURL}>Overview</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={studio ? editorURL(project) : project.overviewURL}>
            {studio ? "Open studio" : "View images"}
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
export function WorkspaceOverview({
  workspace,
  onAdd,
  onEdit,
  onRemove,
  refresh,
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const studios = workspace.projects.filter((p) => p.kind === "studio"),
    projects = workspace.projects
      .filter((p) =>
        `${p.name} ${p.root}`.toLowerCase().includes(query.toLowerCase()),
      )
      .filter(
        (p) =>
          filter === "all" ||
          (filter === "progress"
            ? p.kind === "studio" && p.completeLocales < p.locales.length
            : p.kind !== "studio"),
      );
  return (
    <div className="@container/overview space-y-7">
      <PageHeading
        title="Projects"
        description="Your screenshots, galleries and languages at a glance."
        actions={
          <>
            <IconButton
              label="Refresh project overview"
              onClick={() => refresh().catch((e) => toast.error(e.message))}
            >
              <RefreshCw />
            </IconButton>
            <Button onClick={onAdd}>
              <Plus />
              Add project
            </Button>
          </>
        }
      />
      <Metrics
        items={[
          [
            workspace.projects.length,
            "Connected projects",
            `${workspace.projects.filter((p) => p.kind === "library").length} image libraries`,
            FolderOpen,
          ],
          [
            studios.reduce((n, p) => n + p.galleries.length, 0),
            "Device galleries",
            `${studios.reduce((n, p) => n + p.cardCount, 0)} cards across your listings`,
            Layers,
          ],
          [
            studios.reduce((n, p) => n + p.completeLocales, 0),
            "Complete asset sets",
            `Of ${studios.reduce((n, p) => n + p.locales.length, 0)} configured language sets`,
            CheckCheck,
          ],
          [
            studios.reduce((n, p) => n + p.totals.exports, 0),
            "Exports present",
            "Based on current gallery files",
            Download,
          ],
        ]}
      />
      <Tabs value={filter} onValueChange={setFilter} className="gap-5">
        <div className="flex flex-col justify-between gap-3 @min-[50rem]/overview:flex-row @min-[50rem]/overview:items-center">
          <TabsList
            aria-label="Project filters"
            className="h-auto w-full @min-[34rem]/overview:w-fit"
          >
            {[
              ["all", "All projects", workspace.projects.length],
              [
                "progress",
                "In progress",
                studios.filter((p) => p.completeLocales < p.locales.length)
                  .length,
              ],
              [
                "setup",
                "Libraries & setup",
                workspace.projects.filter((p) => p.kind !== "studio").length,
              ],
            ].map(([value, label, count]) => (
              <TabsTrigger
                key={value}
                value={value}
                aria-label={label}
                className="min-h-9 gap-2 px-2.5 text-xs sm:text-sm"
              >
                <span className="@max-[24rem]/overview:hidden">{label}</span>
                <span className="@min-[24rem]/overview:hidden">
                  {value === "setup" ? "Libraries" : label}
                </span>
                <Badge
                  variant="secondary"
                  className="hidden min-w-5 justify-center rounded-sm px-1 text-[10px] tabular-nums @min-[24rem]/overview:inline-flex"
                >
                  {count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="w-full @min-[50rem]/overview:w-64">
            <SearchField
              label="Search projects"
              value={query}
              onChange={setQuery}
              placeholder="Search projects…"
            />
          </div>
        </div>
        <TabsContent
          key={filter}
          value={filter}
          className="mt-0 space-y-4"
          aria-label="Projects"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {projects.length} {projects.length === 1 ? "project" : "projects"}
              {query ? ` matching “${query}”` : ""}
            </span>
            <span>Connected folders</span>
          </div>
          {projects.length ? (
            <div className="grid items-stretch gap-5 @min-[42rem]/overview:grid-cols-2 @min-[68rem]/overview:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  {...{ project, onEdit, onRemove, workspace }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                workspace.projects.length
                  ? "No matching projects"
                  : "Give your screenshots a home"
              }
              description={
                workspace.projects.length
                  ? "Try another name or change the filter."
                  : "Connect an app folder, or discover screenshot projects inside a parent folder."
              }
              action={
                <Button
                  onClick={
                    workspace.projects.length
                      ? () => {
                          setQuery("");
                          setFilter("all");
                        }
                      : onAdd
                  }
                >
                  {workspace.projects.length
                    ? "Clear filters"
                    : "Add your first project"}
                </Button>
              }
            />
          )}
        </TabsContent>
      </Tabs>
      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        Complete asset sets have copy, captures, layout maps and exports
        present. Run strict export and review the artwork before publishing.
      </p>
    </div>
  );
}
export function ProjectOverview({
  project,
  onAdd,
  onEdit,
  onRemove,
  workspace,
  refresh,
}) {
  const openViewer = useMediaViewer();
  const [files, setFiles] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    setFiles(null);
    setError("");
    if (project.kind === "library") {
      const abort = new AbortController();
      request(`/api/projects/${project.id}/files`, { signal: abort.signal })
        .then(setFiles)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
      return () => abort.abort();
    }
  }, [project.id, project.kind]);
  const studio = project.kind === "studio";
  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Project overview"
        title={project.name}
        description={
          studio
            ? `${project.galleries.length} galleries · ${project.locales.length} languages · ${project.cardCount} screenshot cards`
            : "Browse the images in this connected folder."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/studio/">
                <ArrowLeft />
                All projects
              </Link>
            </Button>
            {studio && (
              <Button asChild>
                <Link to={editorURL(project)}>
                  Open studio
                  <ArrowRight />
                </Link>
              </Button>
            )}
            <ProjectMenu
              {...{
                project,
                onEdit,
                onRemove,
                capabilities: workspace.capabilities,
              }}
            />
          </>
        }
      />
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
        <FolderOpen className="size-4 shrink-0" />
        <code className="min-w-0 flex-1 truncate" title={project.root}>
          {project.root}
        </code>
        <IconButton
          label="Copy project folder"
          onClick={() =>
            navigator.clipboard
              .writeText(project.root)
              .then(() => toast.success("Project folder copied"))
              .catch((e) => toast.error(e.message))
          }
        >
          <Copy />
        </IconButton>
      </div>
      {studio ? (
        <StudioProjectOverview project={project} />
      ) : project.kind === "library" ? (
        <>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Image className="size-4" />
                Screenshot library
              </CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This folder has no Studio listing yet. Browse the originals
                here; connect a Studio listing to use Cards, Languages and Copy.
              </p>
            </CardHeader>
          </Card>
          {error ? (
            <ErrorNotice message={error} />
          ) : !files ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : (
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
                      <CardContent className="break-all p-3 text-xs text-muted-foreground">
                        {file.file}
                      </CardContent>
                    </Card>
                  </Button>
                ))}
              </div>
              {!files.files.length && (
                <EmptyState
                  title="No screenshots yet"
                  description="Add images to this folder and refresh the overview."
                />
              )}
            </section>
          )}
        </>
      ) : (
        <EmptyState
          title="Let’s reconnect this project"
          description={project.problem}
          action={
            <Button onClick={() => onEdit(project)}>Change folder</Button>
          }
        />
      )}
    </div>
  );
}
