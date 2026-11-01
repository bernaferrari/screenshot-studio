import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Whether a media query matches, updated as it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches);
}

/** A number kept in localStorage, clamped to [min, max]. */
export function useStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): [number, (value: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      return localStorage.getItem(key) !== null &&
        stored >= min &&
        stored <= max
        ? stored
        : fallback;
    } catch {
      return fallback;
    }
  });
  const update = useCallback(
    (next: number) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Private mode: the value lasts for this page.
      }
    },
    [key],
  );
  return [value, update];
}

/** Run `handler` on a keyboard shortcut anywhere in the page. */
export function useShortcut(
  match: (event: KeyboardEvent) => boolean,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      if (match(event)) handler(event);
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [match, handler, enabled]);
}

/** Whether a key event comes from a field where typing should win over shortcuts. */
export const typing = (event: Event): boolean =>
  event.target instanceof Element &&
  !!event.target.closest(
    "input, textarea, select, [contenteditable=true], [role=slider], [role=combobox]",
  );

/** Re-render every `interval` ms (relative times). */
export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}
