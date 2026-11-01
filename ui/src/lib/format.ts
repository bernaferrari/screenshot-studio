// Words and numbers as the editor shows them.
export const modifierKey = /Mac|iPhone|iPad/.test(navigator.platform)
  ? "⌘"
  : "Ctrl";

/** "02-dark_mode" → "Dark mode" */
export const pretty = (text: string | null | undefined): string =>
  String(text || "")
    .replace(/^\d+[-/]/, "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());

const names = new Intl.DisplayNames(["en"], { type: "language" });
/** "de-DE" → "German (Germany)" */
export const language = (code: string): string => {
  try {
    return names.of(code) || code;
  } catch {
    return code;
  }
};

const fieldNames: Record<string, string> = {
  title: "Headline",
  body: "Supporting text",
  alt: "Image description",
  tagline: "Tagline",
  commit: "Timeline label",
  note: "Note",
};
export const fieldName = (field: string): string =>
  fieldNames[field] || pretty(field);

export const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

export const position = (index: number): string =>
  String(index + 1).padStart(2, "0");

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** "3 minutes ago", "yesterday" */
export function ago(
  time: number | string | Date | null | undefined,
  now = Date.now(),
): string {
  if (time === null || time === undefined) return "never";
  const seconds = Math.round((new Date(time).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return Math.abs(seconds) < 10
    ? "just now"
    : relative.format(seconds, "second");
}

export const copyText = (text: string): Promise<void> =>
  navigator.clipboard.writeText(text);
