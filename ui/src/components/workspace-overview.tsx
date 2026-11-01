import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCheck,
  Download,
  FolderOpen,
  Globe2,
  Image,
  Layers,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  IconButton,
  PageHeading,
  ProjectAvatar,
  SearchField,
  Status,
} from "./common";
import type { ProjectActions } from "./projects/project-dialogs";
import { ProjectMenu } from "./projects/project-menu";
import { useMediaViewer } from "./viewer/media-viewer";
import { errorMessage } from "@/lib/api";
import type { MediaItem } from "@/lib/media";
import { projectURL } from "@/lib/route";
import type { ProjectSummary, WorkspaceData } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A few of a project's images, each opening the image viewer. */
export function Filmstrip({
  project,
  large = false,
}: {
  project: ProjectSummary;
  large?: boolean;
}) {
  const openViewer = useMediaViewer();
  const items: MediaItem[] = project.previews.map((preview, index) => ({
    id: `${project.id}-${index}`,
    type: "image",
    src: preview.url,
    width: preview.width,
    height: preview.height,
    title: preview.feature || `Screenshot ${index + 1}`,
    description: project.name,
    filename: preview.url.split("/").at(-1),
  }));
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 overflow-hidden border-y bg-muted/40 p-4",
        large ? "h-72" : "h-44",
      )}
    >
      {project.previews.length ? (
        project.previews.map((preview, i) => (
          <Button
            type="button"
            variant="ghost"
            key={i}
            aria-label={`Enlarge ${project.name} screenshot ${i + 1}`}
            onClick={(event) =>
              openViewer(
                { items, index: i, title: `${project.name} screenshots` },
                event.currentTarget,
              )
            }
            className="h-full min-w-0 flex-1 cursor-zoom-in rounded-md p-0 hover:bg-transparent focus-visible:ring-offset-4"
          >
            <img
              src={preview.url}
              alt={`${project.name}: ${preview.feature}`}
              loading="lazy"
              draggable={false}
              className="max-h-full max-w-full object-contain drop-shadow-sm"
            />
          </Button>
        ))
      ) : (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Image className="size-7" />
          Your screenshots will appear here
        </div>
      )}
    </div>
  );
}

function Metrics({
  items,
}: {
  items: [
    number | string,
    string,
    string,
    ComponentType<{ className?: string }>,
  ][];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @min-[52rem]/overview:grid-cols-4">
      {items.map(([number, label, hint, Icon]) => (
        <Card key={label} className="gap-0 py-0 shadow-none">
          <CardContent className="px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <Icon className="size-4 shrink-0 text-muted-foreground/70" />
            </div>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {number}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  actions,
}: {
  project: ProjectSummary;
  actions: ProjectActions;
}) {
  const remaining =
    project.kind === "studio"
      ? project.locales.length - project.completeLocales
      : 0;
  return (
    <Card className="workspace-card gap-0 overflow-hidden py-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
        <Link
          to={projectURL(project)}
          className="group flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ProjectAvatar
            project={{
              name: project.name,
              icon: project.kind === "studio" ? project.icon : undefined,
            }}
            className="size-10"
          />
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="truncate text-sm underline-offset-4 group-hover:underline">
              {project.name}
            </CardTitle>
            <CardDescription className="text-xs">
              {project.kind === "studio"
                ? `${project.cardCount} cards · ${project.galleries.length} galleries`
                : project.kind === "library"
                  ? "Screenshot library"
                  : "Setup needed"}
            </CardDescription>
          </div>
        </Link>
        <ProjectMenu project={project} actions={actions} />
      </CardHeader>
      <Filmstrip project={project} />
      <CardContent className="flex-1 space-y-4 px-5 py-4">
        {project.kind === "studio" ? (
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
            {project.kind === "library"
              ? `${project.imageCount}${project.truncated ? "+" : ""} images found in this folder.`
              : project.problem}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t bg-muted/20 px-5 py-3">
        <Button asChild variant="outline" size="sm">
          <Link to={projectURL(project)}>
            {project.kind === "studio"
              ? "Open studio"
              : project.kind === "library"
                ? "View images"
                : "Reconnect"}
            <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

type Filter = "all" | "progress" | "setup";

/** Every connected project. */
export function WorkspaceOverview({
  workspace,
  onAdd,
  actions,
  refresh,
}: {
  workspace: WorkspaceData;
  onAdd(): void;
  actions: ProjectActions;
  refresh(): Promise<unknown>;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<Filter>("all");
  const studios = workspace.projects.filter(
      (p): p is Extract<ProjectSummary, { kind: "studio" }> =>
        p.kind === "studio",
    ),
    inProgress = (p: ProjectSummary) =>
      p.kind === "studio" && p.completeLocales < p.locales.length,
    projects = workspace.projects
      .filter((p) =>
        `${p.name} ${p.root}`.toLowerCase().includes(query.toLowerCase()),
      )
      .filter(
        (p) =>
          filter === "all" ||
          (filter === "progress" ? inProgress(p) : p.kind !== "studio"),
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
              onClick={() =>
                refresh().catch((e: unknown) => toast.error(errorMessage(e)))
              }
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
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as Filter)}
        className="gap-5"
      >
        <div className="flex flex-col justify-between gap-3 @min-[50rem]/overview:flex-row @min-[50rem]/overview:items-center">
          <TabsList
            aria-label="Project filters"
            className="h-auto w-full @min-[34rem]/overview:w-fit"
          >
            {(
              [
                ["all", "All projects", workspace.projects.length],
                [
                  "progress",
                  "In progress",
                  workspace.projects.filter(inProgress).length,
                ],
                [
                  "setup",
                  "Libraries & setup",
                  workspace.projects.filter((p) => p.kind !== "studio").length,
                ],
              ] as const
            ).map(([value, label, count]) => (
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
          <p className="text-xs text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
            {query ? ` matching “${query}”` : ""}
          </p>
          {projects.length ? (
            <div className="grid items-stretch gap-5 @min-[42rem]/overview:grid-cols-2 @min-[68rem]/overview:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  actions={actions}
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
        present. Open a project's Review to see what still needs fixing.
      </p>
    </div>
  );
}
