import { useCallback, useEffect, useState } from "react";
import { errorMessage, isAbort, request } from "./api";
import type { Review, ReviewIssue } from "./types";

export interface ReviewSession {
  review: Review | null;
  error: string;
  loading: boolean;
  refresh(): void;
}

/** The project's review queue, fetched again whenever `revision` changes (files changed on disk). */
export function useReview(
  projectId: string | null | undefined,
  revision: number,
): ReviewSession {
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    const abort = new AbortController();
    // Files arrive in bursts (an export writes many); wait for the burst to settle.
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        request<Review>(
          `/api/projects/${encodeURIComponent(projectId)}/review`,
          { signal: abort.signal },
        )
          .then((value) => {
            setReview(value);
            setError("");
          })
          .catch((e: unknown) => {
            if (!isAbort(e)) setError(errorMessage(e));
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      revision || attempt ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [projectId, revision, attempt]);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { review, error, loading, refresh };
}

export const issueCounts = (issues: ReviewIssue[]) => ({
  errors: issues.filter((i) => i.level === "error").length,
  warnings: issues.filter((i) => i.level === "warning").length,
  notes: issues.filter((i) => i.level === "info").length,
});

/** Issues about one card, in one language (issues without a language concern every language). */
export const cardIssues = (
  issues: ReviewIssue[],
  kind: string,
  index: number,
  locale: string,
): ReviewIssue[] =>
  issues.filter(
    (i) =>
      i.card?.kind === kind &&
      i.card.index === index &&
      (!i.locale || i.locale === locale),
  );
