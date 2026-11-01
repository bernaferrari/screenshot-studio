import { useEffect, type RefObject } from "react";

/** Escape runs `close` only while `dialog` is the topmost open dialog. */
export function useTopmostEscape(
  dialog: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const dialogs = [
        ...document.querySelectorAll(
          '[role="dialog"][aria-modal="true"], [role="dialog"][data-slot="dialog-content"]',
        ),
      ].filter((node) => node.getClientRects().length);
      if (dialogs.at(-1) !== dialog.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [dialog, close]);
}
