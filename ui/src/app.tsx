import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Layers, Lock, Plus } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorNotice } from "@/components/common";
import {
  ProjectDialogs,
  type Editing,
  type ProjectActions,
} from "@/components/projects/project-dialogs";
import { ProjectPage } from "@/components/project-page";
import { StudioSidebar } from "@/components/studio-sidebar";
import { Workbench } from "@/components/workbench";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { language } from "@/lib/format";
import {
  editorURL,
  projectURL,
  sectionOf,
  useRoute,
  type Route,
} from "@/lib/route";
import type { ProjectSummary, WorkspaceData } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const sectionNames = {
  gallery: "Gallery",
  languages: "Languages",
  copy: "Languages",
  review: "Review",
};

function Crumbs({ route }: { route: Route }) {
  const project = route.project,
    section = route.editor ? sectionNames[sectionOf(route.view)] : null;
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:block">
          <BreadcrumbLink asChild>
            <Link to="/studio/">Workspace</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:block" />
        {project && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={projectURL(project)} className="max-w-36 truncate">
                  {project.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        {route.view === "copy" && route.editor && project ? (
          <>
            <BreadcrumbItem className="hidden sm:block">
              <BreadcrumbLink asChild>
                <Link to={editorURL(project, "languages")}>Languages</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage className="truncate">
                {route.locale ? language(route.locale) : "Copy"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate">
              {section || (project ? "Images" : "All projects")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Refresh the workspace numbers once a burst of file changes settles. */
function useDebounced(callback: () => void, delay: number): () => void {
  const timer = useRef<number | undefined>(undefined),
    latest = useRef(callback);
  latest.current = callback;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(), delay);
  }, [delay]);
}

export function App() {
  const workspace = useWorkspace(),
    navigate = useNavigate(),
    data: WorkspaceData = workspace.data || {
      projects: [],
      activeProjectId: null,
      capabilities: {},
    },
    route = useRoute(workspace.data),
    [editing, setEditing] = useState<Editing | null>(null),
    [removing, setRemoving] = useState<ProjectSummary | null>(null),
    [command, setCommand] = useState(false),
    refreshSummaries = useDebounced(
      () => workspace.refresh().catch(() => {}),
      600,
    );
  const actions: ProjectActions = useMemo(
    () => ({
      capabilities: data.capabilities,
      edit: setEditing,
      remove: setRemoving,
    }),
    [data.capabilities],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((open) => !open);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    document.title = `${route.project?.name || "All projects"} · Screenshot Studio`;
    setCommand(false);
  }, [route.project?.name, route.id, route.view]);
  useEffect(() => {
    if (document.activeElement === document.body)
      scrollTo({ top: 0, behavior: "instant" });
  }, [route.id, route.view, route.editor]);
  const add = () => setEditing({});

  let page;
  if (workspace.error)
    page = (
      <ErrorNotice
        message={workspace.error}
        title="The workspace could not open"
      >
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => workspace.refresh().catch(() => {})}
        >
          Try again
        </Button>
      </ErrorNotice>
    );
  else if (workspace.loading)
    page = (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  else if (route.project && route.project.kind !== "studio")
    page = <ProjectPage project={route.project} actions={actions} />;
  else if (route.editor && route.base)
    page = (
      <Workbench
        key={route.base}
        route={route}
        summary={route.project?.kind === "studio" ? route.project : undefined}
        actions={actions}
        onFilesChanged={refreshSummaries}
      />
    );
  // A listing's project page is its editor.
  else if (route.project)
    page = <Navigate replace to={projectURL(route.project)} />;
  else if (route.id)
    page = (
      <EmptyState
        title="Project not found"
        description="This project may have been removed from the workspace."
        action={
          <Button asChild>
            <Link to="/studio/">All projects</Link>
          </Button>
        }
      />
    );
  else
    page = (
      <WorkspaceOverview
        workspace={data}
        onAdd={add}
        actions={actions}
        refresh={workspace.refresh}
      />
    );

  return (
    <SidebarProvider
      defaultOpen={!document.cookie.includes("sidebar_state=false")}
      style={{ "--sidebar-width": "16rem" } as CSSProperties}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <StudioSidebar
        workspace={data}
        route={route}
        onAdd={add}
        onSearch={() => setCommand(true)}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm md:px-6">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-4"
          />
          <Crumbs route={route} />
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
            <Lock className="size-3" />
            Changes stay on your computer
          </span>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="@container/main mx-auto w-full max-w-[1600px] min-w-0 space-y-6 px-4 py-7 outline-none md:p-7 xl:p-9"
        >
          {page}
        </main>
      </SidebarInset>
      <ProjectDialogs
        editing={editing}
        setEditing={setEditing}
        removing={removing}
        setRemoving={setRemoving}
        workspace={data}
        refresh={workspace.refresh}
      />
      <CommandDialog open={command} onOpenChange={setCommand}>
        <CommandInput placeholder="Search projects and actions…" />
        <CommandList>
          <CommandEmpty>No matching projects.</CommandEmpty>
          <CommandGroup heading="Workspace">
            <CommandItem onSelect={() => navigate("/studio/")}>
              <Layers />
              All projects
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setCommand(false);
                add();
              }}
            >
              <Plus />
              Add project
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Projects">
            {data.projects.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.root}`}
                onSelect={() => navigate(projectURL(p))}
              >
                <Layers />
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
          {route.project?.kind === "studio" && (
            <CommandGroup heading={route.project.name}>
              {(["gallery", "languages", "review"] as const).map((view) => (
                <CommandItem
                  key={view}
                  value={`${route.project!.name} ${view}`}
                  onSelect={() => navigate(editorURL(route.project!, view))}
                >
                  <Layers />
                  {sectionNames[view]}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  );
}
