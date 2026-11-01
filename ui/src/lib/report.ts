// What a card's live render noticed, in words.
import type { CardReport } from "./types";

/** Short, for the image viewer's footer. */
export const reportProblems = (report: CardReport | null): string[] =>
  report
    ? [
        report.missingCopy?.length ? "Untranslated copy" : null,
        report.fallbackCaptures?.length ? "Reference capture borrowed" : null,
        report.fixedCallouts?.length ? "Callout needs review" : null,
        report.fit === 0 ? "Copy is too long" : null,
      ].filter((text): text is string => !!text)
    : [];

/** In full, for the inspector's checks. */
export const reportNotes = (
  report: CardReport | null,
  reference: string,
): string[] =>
  report
    ? [
        report.missingCopy.length > 0 &&
          `Untranslated: ${report.missingCopy.join(", ")}`,
        report.fallbackCaptures.length > 0 &&
          `Borrows the ${reference} capture: ${report.fallbackCaptures.join(", ")}`,
        report.fixedCallouts.length > 0 &&
          "A callout kept its reference position",
        report.fit === 0 && "The words don't fit, even shrunk",
        report.fit > 0 &&
          report.fit < 1 &&
          `Words shrunk to ${Math.round(report.fit * 100)}% to fit`,
      ].filter((text): text is string => !!text)
    : [];
