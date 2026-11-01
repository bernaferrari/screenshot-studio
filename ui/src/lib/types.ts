// Types the editor shares with the studio: the files an app keeps (src/core) and what the local server answers.
export type {
  Callout,
  Card,
  CardReport,
  Copy,
  CopyEntry,
  DeviceSpec,
  Galleries,
  Listing,
  Profile,
  Profiles,
  StudioConfig,
  UiNode,
  UiTree,
} from "../../../src/core/types";
export type {
  CoverageTotals,
  DiscoveredProject,
  Discovery,
  GallerySummary,
  ImageFile,
  LocaleCoverage,
  Preview,
  ProjectSummary,
} from "../../../src/node/workspace/store";
export type { Review, ReviewIssue } from "../../../src/node/workspace/review";
export type { ListingChange } from "../../../src/node/workspace/events";

import type {
  ImageFile,
  ImageLibrary,
  ProjectSummary,
} from "../../../src/node/workspace/store";

/** GET /api/workspace */
export interface WorkspaceData {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  defaultSearchRoot?: string;
  capabilities: { folderPicker?: boolean; revealFolder?: boolean };
  /** The page is served without the workspace API (a static copy). */
  standalone?: boolean;
}
/** A project with a Studio listing: the editor's projects. */
export type StudioProject = Extract<ProjectSummary, { kind: "studio" }>;
/** GET /api/projects/:id/files */
export type LibraryFiles = Omit<ImageLibrary, "files"> & {
  files: (ImageFile & { url: string })[];
};
/** POST /api/projects, /api/projects/import */
export interface ProjectsChanged {
  projects: ProjectSummary[];
  added?: string[];
}
