import { useEffect, useState } from "react";
import { isAbort, request } from "@/lib/api";
import { usableNodes } from "@/lib/callout";
import type { UiNode, UiTree } from "@/lib/types";
import type { Size } from "@/lib/viewer";

export interface ReferenceCapture {
  /** The capture's own size, once its image has decoded. */
  size: Size | null;
  /** Its layout map's usable elements. */
  nodes: UiNode[];
  /** How element selection stands, for the picker to show. */
  message: string;
  loading: boolean;
  error: string;
}

/** Decodes the capture shown in `image` and loads its layout map from `layoutURL`. */
export function useReferenceCapture(
  image: HTMLImageElement | null,
  url: string,
  layoutURL: string,
): ReferenceCapture {
  const [size, setSize] = useState<Size | null>(null),
    [nodes, setNodes] = useState<UiNode[]>([]),
    [message, setMessage] = useState("Loading capture elements…"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!image) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    setSize(null);
    setNodes([]);
    setMessage("Loading capture elements…");
    (async () => {
      try {
        await image.decode();
        if (abort.signal.aborted) return;
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        setSize(size);
        let tree: UiTree | null;
        try {
          tree = await request<UiTree>(layoutURL, {
            optional: true,
            signal: abort.signal,
          });
        } catch (e) {
          if (!isAbort(e))
            setMessage(
              "The layout map could not load. Draw a box, or recapture to add element selection.",
            );
          return;
        }
        if (abort.signal.aborted) return;
        if (!tree)
          return setMessage(
            "No layout map for this capture. Draw a box, or recapture to add element selection.",
          );
        if (tree.width !== size.width || tree.height !== size.height)
          return setMessage(
            "The layout map and capture sizes differ. Recapture before using element selection.",
          );
        const usable = usableNodes(tree, size);
        setNodes(usable);
        setMessage(
          usable.length
            ? "Exact bounds from this capture. Select a parent to include the whole control."
            : "This capture has no visible elements. Draw a box instead.",
        );
      } catch {
        if (!abort.signal.aborted)
          setError(
            "The reference capture could not load. Capture the reference language first, then reopen the picker.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
    // `url` is the image's source: a new one decodes again.
  }, [image, url, layoutURL]);
  return { size, nodes, message, loading, error };
}
