import { useRef, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { Image, Languages, ListChecks } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorNotice } from "./common";
import { CopyEditor } from "./copy/copy-editor";
import { GalleryView } from "./gallery/gallery-view";
import { LanguagesView } from "./languages-view";
import { ProjectHeader } from "./project-header";
import type { ProjectActions } from "./projects/project-dialogs";
import { ReviewView } from "./review-view";
import { useProject } from "@/lib/project";
import { issueCounts, useReview } from "@/lib/review";
import { sectionOf, type Route, type View } from "@/lib/route";
import type { StudioProject } from "@/lib/types";
import { cn } from "@/lib/utils";

const sections: [View, string, ComponentType<{ className?: string }>][] = [
  ["gallery", "Gallery", Image],
  ["languages", "Languages", Languages],
  ["review", "Review", ListChecks],
];

/** A studio project: its header, then Gallery, Languages (with each language's copy) or Review. */
export function Workbench({
  route,
  summary,
  actions,
  onFilesChanged,
}: {
  route: Route;
  summary: StudioProject | undefined;
  actions: ProjectActions;
  onFilesChanged(): void;
}) {
  const session = useProject(route.base!, route.id, onFilesChanged),
    review = useReview(route.id, session.reviewRevision),
    { model, error } = session,
    // The gallery stays mounted once opened, so its rendered cards survive a visit to another section.
    galleryOpened = useRef(false);
  if (error)
    return <ErrorNotice message={error} title="This project could not open" />;
  if (!model)
    return (
      <div className="space-y-6" aria-busy>
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  const section = sectionOf(route.view),
    issues = review.review?.issues || [],
    counts = issueCounts(issues),
    locale =
      route.locale && model.locales.includes(route.locale)
        ? route.locale
        : model.reference;
  if (route.view === "gallery") galleryOpened.current = true;
  const linkFor = (view: View) => {
    const query = new URLSearchParams(location.search);
    query.set("view", view);
    query.delete("card");
    if (view !== "gallery") query.delete("store");
    return `${route.base}?${query}`;
  };
  return (
    <div className="@container/workbench space-y-6">
      <ProjectHeader
        summary={summary}
        model={model}
        live={session.live}
        counts={counts}
        reviewing={review.loading}
        route={route}
        actions={actions}
      >
        <nav
          aria-label="Project sections"
          className="-mb-px flex gap-1 overflow-x-auto"
        >
          {sections.map(([view, label, Icon]) => {
            const current = section === view,
              badge =
                view === "review" && review.review
                  ? counts.errors + counts.warnings
                  : 0;
            return (
              <Link
                key={view}
                to={linkFor(view)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-2 text-sm sm:px-3 font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  current
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="hidden size-4 min-[400px]:block" />
                {label}
                {badge > 0 && (
                  <span
                    className={cn(
                      "rounded px-1.5 text-xs tabular-nums",
                      counts.errors
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </ProjectHeader>
      {galleryOpened.current && (
        <div
          hidden={route.view !== "gallery"}
          inert={route.view !== "gallery" || undefined}
        >
          <GalleryView
            session={session}
            model={model}
            route={route}
            summary={summary}
            issues={issues}
            active={route.view === "gallery"}
          />
        </div>
      )}
      {route.view === "languages" && (
        <LanguagesView
          session={session}
          model={model}
          route={route}
          summary={summary}
        />
      )}
      {route.view === "copy" && (
        <CopyEditor
          key={locale}
          session={session}
          model={model}
          locale={locale}
          route={route}
        />
      )}
      {route.view === "review" && (
        <ReviewView review={review} model={model} route={route} />
      )}
    </div>
  );
}
