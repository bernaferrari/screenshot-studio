// One language's words beside the reference's, as the copy editor and inspector list them.
import type { Card, Copy } from "./types";

/** A key's fields to show: a translation gets only what the reference writes; the reference shows every field, empty ones too. */
export const writtenFields = (
  reference: Copy,
  key: string,
  translating: boolean,
): string[] =>
  Object.keys(reference[key] || {}).filter(
    (field) => !translating || reference[key][field]?.trim(),
  );

/** A card's fields as [key, field] pairs from its copy keys; a card with no words yet gets a headline and a line in the reference. */
export function cardFields(
  card: Card,
  kind: string,
  keys: string[],
  reference: Copy,
  translating: boolean,
): [string, string][] {
  if (keys.length)
    return keys.flatMap((key) =>
      writtenFields(reference, key, translating).map(
        (field): [string, string] => [key, field],
      ),
    );
  if (translating) return [];
  const key =
    card.sharedCopy === false ? `${kind}/${card.feature}` : card.feature;
  return [
    [key, "title"],
    [key, "body"],
  ];
}

export interface CopyRow {
  key: string;
  /** The fields that pass the filters. */
  fields: string[];
}

/** Each key's fields matching a search (of key, field name and both texts) and, with `missing`, still empty; the focused field stays while it's being typed into. */
export function copyRows(
  keys: string[],
  reference: Copy,
  copy: Copy,
  translating: boolean,
  {
    query,
    missing,
    focused,
    fieldName,
  }: {
    query: string;
    missing: boolean;
    focused: string | null;
    fieldName(field: string): string;
  },
): CopyRow[] {
  const needle = query.toLowerCase();
  return keys.map((key) => ({
    key,
    fields: writtenFields(reference, key, translating).filter(
      (field) =>
        `${key} ${fieldName(field)} ${reference[key][field]} ${copy[key]?.[field] || ""}`
          .toLowerCase()
          .includes(needle) &&
        (!missing ||
          !copy[key]?.[field]?.trim() ||
          focused === `${key}/${field}`),
    ),
  }));
}

/** The gallery a copy key belongs to: "<gallery>/<feature>" names it, a shared key has none. */
export const copyScope = (key: string): string | null =>
  key.includes("/") ? key.split("/")[0] : null;
