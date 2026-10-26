import { useMediaViewer } from "./media-viewer";
import { Search, FolderOpen, Image, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export function SearchField({ label, value, onChange, placeholder }) {
  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 pl-9"
      />
    </div>
  );
}
export function Choice({ label, value, onChange, items, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function IconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export function Status({ children, tone = "muted", ...props }) {
  return (
    <Badge
      variant="secondary"
      {...props}
      className={
        tone === "warning"
          ? "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : tone === "success"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : ""
      }
    >
      {children}
    </Badge>
  );
}
export function ErrorNotice({
  message,
  title = "Something needs attention",
  children,
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {message}
        {children}
      </AlertDescription>
    </Alert>
  );
}
export function EmptyState({
  title,
  description,
  action,
  icon: Icon = FolderOpen,
}) {
  return (
    <Empty className="rounded-xl border border-dashed bg-card py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
export function Metrics({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 @min-[52rem]/overview:grid-cols-4 xl:grid-cols-4">
      {items.map(([number, label, hint, Icon]) => (
        <Card key={label} className="gap-0 py-0 shadow-none">
          <CardContent className="px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              {Icon && (
                <Icon className="size-4 shrink-0 text-muted-foreground/70" />
              )}
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
export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-col items-start justify-between gap-5 @min-[48rem]/main:flex-row @min-[48rem]/main:items-center">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
export function ProjectAvatar({ project, className = "size-8" }) {
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-sm font-semibold text-primary`}
    >
      {project.icon ? (
        <img src={project.icon} alt="" className="size-full object-cover" />
      ) : (
        project.name?.[0] || "S"
      )}
    </span>
  );
}
export function Filmstrip({ project, large = false }) {
  const openViewer = useMediaViewer();
  const items = (project.previews || []).map((preview, index) => ({
    id: `${project.id}-${index}`,
    src: preview.url,
    width: preview.width,
    height: preview.height,
    title: preview.feature || `Screenshot ${index + 1}`,
    description: project.name,
    type: "image",
    filename: preview.url.split("/").at(-1),
  }));
  return (
    <div
      className={`flex items-center justify-center gap-2 overflow-hidden border-y bg-muted/40 p-4 ${large ? "h-72" : "h-44"}`}
    >
      {project.previews?.length ? (
        project.previews.map((p, i) => (
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
              src={p.url}
              alt={`${project.name}: ${p.feature}`}
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
