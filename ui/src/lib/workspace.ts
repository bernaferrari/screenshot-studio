import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "./api";
import type { WorkspaceData } from "./types";

export interface WorkspaceSession {
  data: WorkspaceData | null;
  error: string;
  loading: boolean;
  refresh(): Promise<WorkspaceData | null>;
}

/** Every connected project with its coverage, from GET /api/workspace. */
export function useWorkspace(): WorkspaceSession {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const value = await request<WorkspaceData>("/api/workspace", {
        optional: true,
      });
      setData(
        value || {
          projects: [],
          activeProjectId: null,
          standalone: true,
          capabilities: {},
        },
      );
      setError("");
      return value;
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  return { data, error, loading, refresh };
}
