import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** An icon button on the viewer's dark chrome, named by its tooltip. */
export function ViewerAction({
  label,
  children,
  className,
  render,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type={render ? undefined : "button"}
            variant="ghost"
            size="icon"
            aria-label={label}
            className={`size-10 shrink-0 text-neutral-200 hover:bg-white/10 hover:text-white focus-visible:ring-white/60 disabled:text-neutral-600 ${className || ""}`}
            render={render}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
