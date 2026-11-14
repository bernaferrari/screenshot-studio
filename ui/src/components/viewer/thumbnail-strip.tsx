import { memo, useEffect, useRef, useState } from "react";
import { Check, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { MediaItem } from "@/lib/media";

const smooth = (): ScrollBehavior =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";

/** Every image in the viewer, the current one scrolled to the middle. */
export const ThumbnailStrip = memo(function ThumbnailStrip({
  items,
  index,
  onSelect,
}: {
  items: MediaItem[];
  index: number;
  onSelect(index: number): void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = strip.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      ),
      button = node?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!node || !button) return;
    const rect = node.getBoundingClientRect(),
      b = button.getBoundingClientRect();
    node.scrollTo({
      left:
        node.scrollLeft + b.left - rect.left - (node.clientWidth - b.width) / 2,
      behavior: smooth(),
    });
  }, [index]);
  return (
    <ScrollArea
      ref={strip}
      className="w-full border-t border-white/10"
    >
      <div className="flex w-max min-w-full justify-center gap-2 px-4 py-3">
        {items.map((item, i) => (
          <Thumbnail
            key={item.id || `${item.src}-${i}`}
            item={item}
            index={i}
            active={i === index}
            onSelect={onSelect}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
});

function Thumbnail({
  item,
  index,
  active,
  onSelect,
}: {
  item: MediaItem;
  index: number;
  active: boolean;
  onSelect(index: number): void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`Show screenshot ${index + 1}: ${item.title}`}
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect(index)}
      className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-md border p-1 hover:bg-white/10 focus-visible:ring-white/60 sm:h-18 sm:w-14 ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-white/15 bg-white/5 opacity-70 hover:opacity-100"}`}
    >
      {!failed && (item.thumbnail || item.src) ? (
        <img
          src={item.thumbnail || item.src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          className="pointer-events-none size-full object-contain"
        />
      ) : (
        <ImageIcon className="size-5 text-neutral-400" />
      )}
      <span className="absolute right-0 bottom-0 rounded-tl bg-black/80 px-1 text-[10px] text-white tabular-nums">
        {index + 1}
      </span>
      {active && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 rounded-full bg-primary p-0.5 text-primary-foreground"
        >
          <Check className="size-2.5" />
        </span>
      )}
    </Button>
  );
}
