import { useCallback, useEffect, useRef, type Dispatch } from "react";
import type { CardReport } from "@/lib/types";
import type { ViewerEvent } from "@/lib/viewer";

/** Waits for a loaded live preview to finish rendering (data-ready on its root), then takes its report. */
export function useLiveReady(dispatch: Dispatch<ViewerEvent>) {
  const frame = useRef<HTMLIFrameElement>(null),
    poll = useRef<number | undefined>(undefined);
  const stop = useCallback(() => window.clearInterval(poll.current), []);
  useEffect(() => stop, [stop]);
  const onLoad = useCallback(() => {
    stop();
    const node = frame.current,
      start = Date.now();
    const check = () => {
      if (node !== frame.current) return stop();
      const root = node?.contentDocument?.documentElement;
      if (root?.dataset.ready === "true") {
        dispatch({
          type: "loaded",
          report: JSON.parse(root.dataset.report || "{}") as CardReport,
        });
        stop();
      } else if (Date.now() - start > 25000) {
        dispatch({
          type: "failed",
          error:
            "This live preview could not finish loading. Try again or open the original preview.",
        });
        stop();
      }
    };
    poll.current = window.setInterval(check, 120);
    check();
  }, [dispatch, stop]);
  return { frame, onLoad, stop };
}
