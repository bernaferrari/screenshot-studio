import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { OpenViewer, ViewerRequest } from "@/lib/media";
import { clamp } from "@/lib/viewer";
import { ViewerDialog } from "./viewer-dialog";

export interface ViewerSession extends ViewerRequest {
  index: number;
  key: string;
}

const ViewerContext = createContext<OpenViewer | null>(null);

/** Lets any page open the image viewer; it closes on navigation and gives focus back to what opened it. */
export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ViewerSession | null>(null),
    trigger = useRef<Element | null>(null),
    location = useLocation();
  useEffect(() => setSession(null), [location.key]);
  const open = useCallback<OpenViewer>(
    ({ items, index = 0, title = "Screenshot gallery", notice }, element) => {
      if (!items.length) return;
      trigger.current = element || document.activeElement;
      setSession({
        items,
        index: clamp(index, 0, items.length - 1),
        title,
        notice,
        key: crypto.randomUUID(),
      });
    },
    [],
  );
  const close = useCallback(() => setSession(null), []);
  const restoreFocus = useCallback(() => {
    const element = trigger.current;
    if (
      element instanceof HTMLElement &&
      element.isConnected &&
      !element.closest("[hidden],[inert]")
    )
      return element;
    return false;
  }, []);
  return (
    <ViewerContext.Provider value={open}>
      {children}
      {session && (
        <ViewerDialog
          key={session.key}
          session={session}
          close={close}
          restoreFocus={restoreFocus}
        />
      )}
    </ViewerContext.Provider>
  );
}

export function useMediaViewer(): OpenViewer {
  const open = useContext(ViewerContext);
  if (!open) throw new Error("Image viewers require MediaViewerProvider.");
  return open;
}
