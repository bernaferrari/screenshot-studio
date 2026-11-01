import { Download, ExternalLink, Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/media";
import { ViewerAction } from "./viewer-action";

/** Zoom controls, what kind of image this is, and download or open it. */
export function ViewerToolbar({
  item,
  live,
  zoom,
  scale,
  fit,
  maxZoom,
  loaded,
  error,
  draft,
  onZoom,
}: {
  item: MediaItem;
  live: boolean;
  zoom: number;
  scale: number;
  fit: number;
  maxZoom: number;
  loaded: boolean;
  error: string;
  /** The live render noticed problems: the artwork isn't final. */
  draft: boolean;
  onZoom(zoom: number): void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
      <div className="flex items-center gap-0.5">
        <ViewerAction
          label="Zoom out"
          onClick={() => onZoom(zoom / 1.5)}
          disabled={zoom <= 1.001 || !!error}
        >
          <Minus />
        </ViewerAction>
        <span
          className="w-12 text-center text-xs text-neutral-300 tabular-nums"
          role="status"
          aria-label="Image zoom"
        >
          {Math.round(scale * 100)}%
        </span>
        <ViewerAction
          label="Zoom in"
          onClick={() => onZoom(zoom * 1.5)}
          disabled={zoom >= maxZoom || !!error}
        >
          <Plus />
        </ViewerAction>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Fit image"
          onClick={() => onZoom(1)}
          className={`text-xs text-neutral-300 hover:bg-white/10 hover:text-white ${zoom === 1 ? "bg-white/10" : ""}`}
        >
          <Maximize className="size-3.5" />
          Fit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Actual image size"
          onClick={() => onZoom(1 / Math.max(0.0001, fit))}
          className="text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          1:1
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <span
          className={`hidden rounded px-2 py-1 text-[11px] sm:block ${draft ? "bg-amber-400/10 text-amber-200" : "text-neutral-400"}`}
        >
          {draft
            ? "Draft artwork · review required"
            : live
              ? "Live artwork"
              : "Original image"}
        </span>
        {!live && loaded && !error && (
          <ViewerAction asChild label="Download image">
            <a
              href={item.src}
              download={item.filename || item.src.split("/").at(-1)}
            >
              <Download />
            </a>
          </ViewerAction>
        )}
        <ViewerAction
          asChild
          label={
            live ? "Open full preview in new tab" : "Open original in new tab"
          }
        >
          <a
            href={live ? `${item.previewURL}&fit` : item.src}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink />
          </a>
        </ViewerAction>
      </div>
    </div>
  );
}
