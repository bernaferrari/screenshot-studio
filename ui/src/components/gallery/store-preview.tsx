import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MoreVertical,
  Search,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import { asset, request } from "@/lib/api";
import { language, pretty } from "@/lib/format";
import { cardsFor, type ProjectModel } from "@/lib/project";
import type { Source } from "@/lib/route";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardFrame } from "./card-frame";

/**
 * Google Play's carousel shows screenshots at about this height (dp) on a 412 dp-wide phone, and a little taller on
 * tablets. One CSS pixel stands in for one dp, which is roughly how large a phone shows it at reading distance.
 */
export const STORE_THUMBNAIL = {
  phone: { width: 412, height: 210 },
  tablet: { width: 820, height: 300 },
};

interface StorePreviewProps {
  model: ProjectModel;
  kind: string;
  locale: string;
  source: Source;
  icon?: string;
  revision: string;
  exportRevision: number;
  storeTextRevision: number;
  selected: number | null;
  onSelect(index: number): void;
  onKind(kind: string): void;
}

/** The gallery as a Play store page: the app's icon and name, then its cards at the store's thumbnail size. */
export function StorePreview({
  model,
  kind,
  locale,
  source,
  icon,
  revision,
  exportRevision,
  storeTextRevision,
  selected,
  onSelect,
  onKind,
}: StorePreviewProps) {
  const profile = model.profiles[kind],
    cards = cardsFor(model.galleries, kind),
    device = profile.frame === "tablet" ? "tablet" : "phone",
    size = STORE_THUMBNAIL[device],
    listing = useStoreText(model, locale, storeTextRevision),
    name = listing?.title || listing?.appName || model.config.app || "Your app";
  if (
    profile.defaultLocaleOnly ||
    profile.frame === "none" ||
    profile.frame === "browser"
  ) {
    const store = Object.keys(model.galleries).find(
      (k) =>
        !model.profiles[k]?.defaultLocaleOnly &&
        model.profiles[k]?.frame === "phone",
    );
    return (
      <EmptyState
        icon={Store}
        title={`${profile.label || pretty(kind)} isn't shown on Google Play`}
        description="The store page shows phone and tablet screenshots. Choose one of those galleries to see your listing as people will."
        action={
          store ? (
            <Button onClick={() => onKind(store)}>
              Show {model.profiles[store].label || pretty(store)}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div
      className="store-preview flex flex-col items-center gap-4 rounded-xl border bg-muted/30 px-4 py-8"
      data-device={device}
    >
      <div
        className="w-full overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-900 bg-white text-[#1f1f1f] shadow-xl dark:border-neutral-700 dark:bg-[#131314] dark:text-[#e3e3e3]"
        style={{ maxWidth: size.width + 20 }}
        role="region"
        aria-label={`Google Play store page preview, ${language(locale)}`}
      >
        <div
          className="flex h-12 items-center justify-between px-3 text-[#444746] dark:text-[#c4c7c5]"
          aria-hidden
        >
          <ArrowLeft className="size-5" />
          <div className="flex gap-4">
            <Search className="size-5" />
            <MoreVertical className="size-5" />
          </div>
        </div>
        <div className="flex items-center gap-4 px-6 pt-2 pb-5">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#e8f0fe] text-2xl font-semibold text-[#0b57d0] shadow-sm dark:bg-[#1e2a3a] dark:text-[#a8c7fa]">
            {icon ? (
              <img src={icon} alt="" className="size-full object-cover" />
            ) : (
              name[0]
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[22px] leading-7 font-medium">{name}</p>
            {/* Where Play shows the developer: listing.json "developer", when there is one. */}
            {listing?.developer && (
              <p className="truncate text-sm text-[#01875f] dark:text-[#6dd58c]">
                {String(listing.developer)}
              </p>
            )}
          </div>
        </div>
        <div className="px-6 pb-5" aria-hidden>
          <div className="flex h-10 items-center justify-center rounded-full bg-[#01875f] text-sm font-medium text-white dark:bg-[#6dd58c] dark:text-[#00391c]">
            Install
          </div>
        </div>
        <div className="store-carousel flex gap-2 overflow-x-auto overscroll-x-contain px-6 pb-6 [scrollbar-width:none]">
          {cards.map((card, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Inspect ${pretty(card.feature)}`}
              aria-pressed={selected === index}
              className={cn(
                "shrink-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
                selected === index &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-[#131314]",
              )}
            >
              <CardFrame
                {...{
                  model,
                  locale,
                  kind,
                  card,
                  index,
                  source,
                  revision,
                  exportRevision,
                }}
                height={size.height}
                rounded
              />
            </button>
          ))}
        </div>
        <div className="space-y-2 px-6 pb-8">
          <p className="flex items-center justify-between text-base font-medium">
            About this app
            <ArrowRight
              className="size-5 text-[#444746] dark:text-[#c4c7c5]"
              aria-hidden
            />
          </p>
          <p
            className={cn(
              "text-sm leading-5 text-[#444746] dark:text-[#c4c7c5]",
              !listing?.shortDescription && "italic",
            )}
          >
            {listing?.shortDescription ||
              `No short description yet. Add "shortDescription" to ${locale}/listing.json.`}
          </p>
        </div>
      </div>
      <p className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
        Cards at Play's carousel size: about {size.height} dp tall on a{" "}
        {size.width} dp-wide {device}. If a headline is hard to read here, it's
        hard to read in the store.
      </p>
    </div>
  );
}

/** <locale>/listing.json, the store text, or null while it's missing. */
function useStoreText(
  model: ProjectModel,
  locale: string,
  revision: number,
): Listing | null {
  const [listing, setListing] = useState<Listing | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    request<Listing>(asset(model.base, `../${locale}/listing.json`), {
      optional: true,
      signal: abort.signal,
    })
      .then((value) => setListing(value))
      .catch(() => setListing(null));
    return () => abort.abort();
  }, [model.base, locale, revision]);
  return listing;
}
