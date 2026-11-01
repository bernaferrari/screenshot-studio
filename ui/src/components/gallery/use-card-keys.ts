import { useEffect } from "react";
import { typing } from "@/lib/hooks";

/** While a card is inspected: Escape closes the inspector; ← and → move between cards, unless typing or a dialog is open. */
export function useCardKeys(
  enabled: boolean,
  close: () => void,
  move: (direction: number) => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    const keys = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        typing(event) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"]:not(.inspector-sheet), [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else return;
      event.preventDefault();
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [enabled, close, move]);
}
