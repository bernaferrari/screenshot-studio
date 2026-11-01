/** store-listing/brand/icon.json and what buildIcons() takes and returns. */

export type Shape = 'square' | 'rounded' | 'circle' | 'mark';

/** Where Android's launcher icons go. */
export interface AndroidTarget {
  /** The res folder, from the repository root. */
  res: string;
  /** Also write ic_launcher (and ic_launcher_round) PNGs for launchers without adaptive icons. */
  legacy?: boolean;
  /** false leaves out the round icon. */
  round?: boolean;
  name?: string;
  type?: 'mipmap' | 'drawable';
}

export interface FileTarget {
  path: string;
  size?: number;
  shape?: Shape;
  scale?: number;
  opaque?: boolean;
  /** One extra layer, brand/<layer>.svg, drawn alone. */
  layer?: string;
  /** For a .icon: Icon Composer layer names and the brand layer each draws. */
  apple?: Record<string, string>;
}

/** One icon: its layers folder under brand/ and every target it is written to. */
export interface IconJob {
  layers?: string;
  monochrome?: boolean;
  android?: AndroidTarget;
  files?: FileTarget[];
}

/** store-listing/brand/icon.json: one icon, or several under "icons". */
export type IconSpec = IconJob & {icons?: IconJob[]};

export interface IconOptions {
  /** brand/icon.json (default: <listing>/brand/icon.json). Target paths in it are from the repository root, two folders up. */
  spec?: string;
  /** The store-listing folder (default: the one this studio copy lives in). */
  listing?: string;
  /** One line per file written (default: console.log). */
  log?: (line: string) => void;
}

export interface IconResult {
  /** Every file written, relative to the repository root. */
  written: string[];
}
