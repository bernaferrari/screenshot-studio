import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ThemeProvider } from "next-themes";
import {
  Plus,
  Search,
  Lock,
  RefreshCw,
  Layers,
  Copy,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { StudioSidebar } from "@/components/studio-sidebar";
import { ProjectDialogs } from "@/components/project-dialogs";
import {
  WorkspaceOverview,
  ProjectOverview,
} from "@/components/workspace-pages";
import { Workbench } from "@/components/workbench";
import { ErrorNotice, EmptyState } from "@/components/common";
import { useWorkspace, useRoute, pretty, editorURL } from "@/lib/model";
import { MediaViewerProvider } from "@/components/media-viewer";
import "./styles.css";
function Launch() {
  const command = location.pathname.includes("/store-listing/")
    ? "node store-listing/studio/server.cjs 8790"
    : "node studio/server.cjs 8790";
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-xl shadow-sm">
        <CardHeader>
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers />
          </span>
          <CardTitle className="text-3xl tracking-tight">
            Open your screenshot workspace
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Connect your app projects, refine store artwork, and bring every
            language together. Start the local server from your repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
            {command}
          </pre>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button
            onClick={() =>
              navigator.clipboard
                .writeText(command)
                .then(() => toast.success("Launch command copied"))
                .catch(() => toast.error("Select and copy the command above."))
            }
          >
            <Copy />
            Copy command
          </Button>
          <Button asChild variant="outline">
            <a href="http://127.0.0.1:8790/studio/">
              Open local studio
              <ArrowRight />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
function App() {
  const workspace = useWorkspace(),
    location = useLocation(),
    navigate = useNavigate(),
    data = workspace.data || { projects: [], capabilities: {} },
    route = useRoute(location, navigate, data),
    [editing, setEditing] = useState(null),
    [removing, setRemoving] = useState(null),
    [command, setCommand] = useState(false);
  useEffect(() => {
    const key = (e) => {
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
    if (document.activeElement === document.body)
      scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname, location.search, route.project?.name]);
  const add = () => setEditing({}),
    onEdit = setEditing,
    onRemove = setRemoving;
  return (
    <SidebarProvider
      defaultOpen={!document.cookie.includes("sidebar_state=false")}
      style={{ "--sidebar-width": "16rem" }}
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
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="hidden sm:block">
                <BreadcrumbLink asChild>
                  <Link to="/studio/">Workspace</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              {route.project && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        to={route.project.overviewURL}
                        className="max-w-36 truncate"
                      >
                        {route.project.name}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate">
                  {route.editor
                    ? pretty(route.view)
                    : route.project
                      ? "Overview"
                      : "All projects"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
            <Lock className="size-3" />
            Changes stay on your computer
          </span>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="@container/main mx-auto w-full max-w-[1440px] min-w-0 space-y-6 px-4 py-7 outline-none md:p-7 xl:p-9"
        >
          {workspace.error ? (
            <ErrorNotice
              message={workspace.error}
              title="The workspace could not open"
            >
              <Button
                variant="outline"
                onClick={() => workspace.refresh().catch(() => {})}
              >
                Try again
              </Button>
            </ErrorNotice>
          ) : workspace.loading ? (
            <div className="space-y-6">
              <Skeleton className="h-10 w-64" />
              <div className="grid gap-4 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-72" />
                ))}
              </div>
            </div>
          ) : route.editor ? (
            route.project && route.project.kind !== "studio" ? (
              <ProjectOverview
                {...{
                  project: route.project,
                  workspace: data,
                  onAdd: add,
                  onEdit,
                  onRemove,
                  refresh: workspace.refresh,
                }}
              />
            ) : (
              <Workbench
                key={route.base}
                route={route}
                summary={route.project}
                onSaved={workspace.refresh}
              />
            )
          ) : route.project ? (
            <ProjectOverview
              {...{
                project: route.project,
                workspace: data,
                onAdd: add,
                onEdit,
                onRemove,
                refresh: workspace.refresh,
              }}
            />
          ) : route.id ? (
            <EmptyState
              title="Project not found"
              description="This project may have been removed from the workspace."
              action={
                <Button asChild>
                  <Link to="/studio/">All projects</Link>
                </Button>
              }
            />
          ) : (
            <WorkspaceOverview
              workspace={data}
              onAdd={add}
              {...{ onEdit, onRemove, refresh: workspace.refresh }}
            />
          )}
        </main>
      </SidebarInset>
      <ProjectDialogs
        {...{
          editing,
          setEditing,
          removing,
          setRemoving,
          workspace: data,
          refresh: workspace.refresh,
        }}
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
                onSelect={() => navigate(p.overviewURL)}
              >
                <Layers />
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  );
}
createRoot(document.getElementById("root")).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    <TooltipProvider delayDuration={350}>
      {location.protocol === "file:" ? (
        <Launch />
      ) : (
        <BrowserRouter>
          <MediaViewerProvider>
            <App />
          </MediaViewerProvider>
        </BrowserRouter>
      )}
      <Toaster richColors position="bottom-right" />
    </TooltipProvider>
  </ThemeProvider>,
);
