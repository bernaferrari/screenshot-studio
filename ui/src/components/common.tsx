import type { ComponentProps, ComponentType, ReactNode } from "react";
import { FolderOpen, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/types";

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9"
      />
    </div>
  );
}

export interface ChoiceItem {
  value: string;
  label: string;
}
export function Choice({
  label,
  value,
  onChange,
  items,
  className,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  items: ChoiceItem[];
  className?: string;
}) {
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

/** An icon-only button with its label as a tooltip. */
export function IconButton({
  label,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
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

export type Tone = "muted" | "success" | "warning" | "danger" | "info";
export const toneClass: Record<Tone, string> = {
  muted: "",
  success:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  warning:
    "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-800 dark:text-sky-300",
};
export function Status({
  children,
  tone = "muted",
  className,
  ...props
}: ComponentProps<typeof Badge> & { tone?: Tone }) {
  return (
    <Badge
      variant="secondary"
      {...props}
      className={cn(toneClass[tone], className)}
    >
      {children}
    </Badge>
  );
}

export function ErrorNotice({
  message,
  title = "Something needs attention",
  children,
}: {
  message: ReactNode;
  title?: string;
  children?: ReactNode;
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
  className,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Empty
      className={cn("rounded-xl border border-dashed bg-card py-12", className)}
    >
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

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
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
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function ProjectAvatar({
  project,
  className = "size-8",
}: {
  project: Pick<ProjectSummary, "name"> & { icon?: string };
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-sm font-semibold text-primary",
        className,
      )}
    >
      {project.icon ? (
        <img src={project.icon} alt="" className="size-full object-cover" />
      ) : (
        project.name?.[0] || "S"
      )}
    </span>
  );
}

/** A keyboard shortcut, as shown beside actions. */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground select-none",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
