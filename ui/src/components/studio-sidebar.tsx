import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  ChevronRight,
  ChevronsUpDown,
  Image,
  Languages,
  LayoutDashboard,
  ListChecks,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import logo from "../../logo.svg";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ProjectAvatar } from "./common";
import { modifierKey } from "@/lib/format";
import {
  editorURL,
  projectURL,
  sectionOf,
  type Route,
  type View,
} from "@/lib/route";
import type { WorkspaceData } from "@/lib/types";
import { cn } from "@/lib/utils";

const views: [View, string, typeof Image][] = [
  ["gallery", "Gallery", Image],
  ["languages", "Languages", Languages],
  ["review", "Review", ListChecks],
];

export function StudioSidebar({
  workspace,
  route,
  onAdd,
  onSearch,
}: {
  workspace: WorkspaceData;
  route: Route;
  onAdd(): void;
  onSearch(): void;
}) {
  const { setOpenMobile, isMobile } = useSidebar(),
    { theme, setTheme } = useTheme(),
    [expanded, setExpanded] = useState(
      () => new Set(route.id ? [route.id] : []),
    );
  useEffect(() => {
    if (route.id) setExpanded((old) => new Set([...old, route.id!]));
  }, [route.id]);
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="icon" className="sidebar">
      <SidebarHeader className="relative gap-3 p-3">
        {isMobile && (
          <Button
            aria-label="Close project sidebar"
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10"
            onClick={() => setOpenMobile(false)}
          >
            <X />
          </Button>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Screenshot Studio">
              <Link to="/studio/" onClick={close}>
                <img src={logo} alt="" className="size-8 shrink-0" />
                <span className="flex flex-col text-left">
                  <span className="text-sm font-semibold">
                    Screenshot Studio
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Real screens, store art
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSearch} tooltip="Search projects">
              <Search />
              <span>Search workspace</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {modifierKey} K
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={!route.id && !route.editor}
                tooltip="All projects"
              >
                <Link to="/studio/" onClick={close}>
                  <LayoutDashboard />
                  <span>All projects</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuBadge>{workspace.projects.length}</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            title="Add project"
            aria-label="Add project"
            onClick={onAdd}
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarMenu aria-label="Screenshot projects">
            {workspace.projects.map((project) => (
              <Collapsible
                asChild
                key={project.id}
                open={expanded.has(project.id)}
                onOpenChange={(open) =>
                  setExpanded((old) => {
                    const next = new Set(old);
                    if (open) next.add(project.id);
                    else next.delete(project.id);
                    return next;
                  })
                }
              >
                <SidebarMenuItem
                  className={cn(
                    "workspace-project",
                    route.id === project.id && "current",
                  )}
                >
                  <SidebarMenuButton
                    asChild
                    tooltip={project.name}
                    className="pr-8"
                    isActive={
                      route.id === project.id && project.kind !== "studio"
                    }
                  >
                    <Link
                      to={projectURL(project)}
                      onClick={close}
                      className="workspace-project-link"
                    >
                      <ProjectAvatar
                        project={{
                          name: project.name,
                          icon:
                            project.kind === "studio"
                              ? project.icon
                              : undefined,
                        }}
                        className="size-6"
                      />
                      <span className="project-link-name">{project.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {project.kind === "studio" && (
                    <>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuAction
                          aria-label={`Expand ${project.name}`}
                          className="data-[state=open]:rotate-90"
                        >
                          <ChevronRight />
                        </SidebarMenuAction>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {views.map(([value, label, Icon]) => (
                            <SidebarMenuSubItem key={value}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={
                                  route.id === project.id &&
                                  route.editor &&
                                  sectionOf(route.view) === value
                                }
                              >
                                <Link
                                  to={editorURL(project, value)}
                                  onClick={close}
                                >
                                  <Icon />
                                  <span>{label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Appearance">
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-background">
                    <Settings2 className="size-4" />
                  </span>
                  <span className="flex flex-1 flex-col text-left">
                    <span className="text-sm">Local workspace</span>
                    <span className="text-xs text-muted-foreground">
                      {workspace.projects.length} connected projects
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                className="min-w-48"
              >
                <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
