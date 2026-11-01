// The gallery strips kept mounted (hidden) so going back to one doesn't render every card again.
import type { Source } from "./route";

export interface Strip {
  kind: string;
  locale: string;
  source: Source;
}

export const stripKey = ({ kind, locale, source }: Strip): string =>
  JSON.stringify([kind, locale, source]);

/**
 * Keep `strip` among `strips`, in place: the oldest go past `max` (never the current one),
 * and so does any whose gallery or language is gone.
 */
export function keepStrip(
  strips: Map<string, Strip>,
  strip: Strip,
  exists: (strip: Strip) => boolean,
  max: number,
): string {
  const key = stripKey(strip);
  if (!strips.has(key)) strips.set(key, strip);
  while (strips.size > max) {
    const oldest = strips.keys().next().value!;
    if (oldest === key) break;
    strips.delete(oldest);
  }
  for (const [old, kept] of strips) if (!exists(kept)) strips.delete(old);
  return key;
}
