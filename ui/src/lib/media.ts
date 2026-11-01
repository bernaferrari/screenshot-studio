// What the image viewer shows, and where a card's artwork lives.
import { asset } from "./api";
import { language, pretty } from "./format";
import { outputFile, type ProjectModel } from "./project";
import type { Source } from "./route";
import type { Card } from "./types";

/** One image in the viewer: a file, or a card's live preview page. */
export interface MediaItem {
  id: string;
  type: "image" | "live";
  src: string;
  /** The live page for a card; offered when its exported image is missing. */
  previewURL?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  title: string;
  description?: string;
  filename?: string;
}
export interface ViewerRequest {
  items: MediaItem[];
  index?: number;
  title?: string;
  /** A note shown under the image (the preview uses saved words, say). */
  notice?: string;
}
export type OpenViewer = (
  request: ViewerRequest,
  trigger?: Element | null,
) => void;

export const previewURL = (
  model: ProjectModel,
  locale: string,
  kind: string,
  index: number,
  revision: string | number = 0,
): string =>
  asset(
    model.base,
    `preview.html?locale=${encodeURIComponent(locale)}&kind=${encodeURIComponent(kind)}&slide=${index}&revision=${revision}`,
  );
export const exportURL = (
  model: ProjectModel,
  locale: string,
  kind: string,
  card: Card,
  index: number,
  revision: string | number = 0,
): string =>
  asset(
    model.base,
    `../${locale}/${outputFile(kind, card, index)}${revision ? `?v=${revision}` : ""}`,
  );

/** A gallery's cards as viewer items, live or exported. */
export function artworkMedia(
  model: ProjectModel,
  locale: string,
  kind: string,
  cards: Card[],
  {
    source = "live",
    start = 0,
    revision = 0,
  }: { source?: Source; start?: number; revision?: string | number } = {},
): MediaItem[] {
  const profile = model.profiles[kind];
  return cards.map((card, offset) => {
    const index = start + offset,
      src = exportURL(model, locale, kind, card, index);
    return {
      id: `${model.base}:${locale}:${kind}:${index}:${source}:${revision}`,
      type: source === "exported" ? "image" : "live",
      src,
      previewURL: previewURL(model, locale, kind, index, revision),
      thumbnail: src,
      width: profile.width,
      height: profile.height,
      title: pretty(card.feature),
      description: `${language(locale)} · ${profile.label || pretty(kind)} · ${source === "exported" ? "Exported artwork" : "Live artwork"}`,
      filename: outputFile(kind, card, index).split("/").at(-1),
    };
  });
}
