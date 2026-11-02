// Screenshot Studio types: every file an app keeps in store-listing/, and the context a theme receives.
// Apps get this file as store-listing/studio/types.d.ts; a theme.js can opt into checking with
//   /** @type {import('./studio/types').Theme} */
//   export default {...};
// The JSON Schemas in schemas/ are generated from these types (`npm run schemas`): their descriptions are these
// comments, and tags like @pattern or @minimum are rules `check` enforces.

/** How a capture is framed. `none` shows it as the whole image. */
export type FrameKind = 'phone' | 'iphone' | 'tablet' | 'browser' | 'none';

/**
 * A language tag: en-US, pt-BR, zh-Hans.
 * @pattern ^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$
 */
export type Locale = string;

/** store-listing/studio.json */
export interface StudioConfig {
  /** The app's name, used by the editor and README name banners. */
  app?: string;
  /** The app's package or bundle ID. */
  package?: string;
  /**
   * Every language the listing is made in.
   * @minItems 1
   */
  locales?: Locale[];
  /** The reference language other languages fall back to. */
  defaultLocale?: Locale;
  /**
   * Render at this multiple and scale down; 2 keeps rotated or scaled UI crisp.
   * @minimum 1
   * @maximum 4
   */
  supersample?: number;
  /**
   * JPEG quality for cards (default 94).
   * @minimum 1
   * @maximum 100
   */
  jpegQuality?: number;
  /** Languages written right to left. */
  rtl?: Locale[];
  /**
   * The smallest size headlines may shrink to before the export fails (default 0.72).
   * @minimum 0.3
   * @maximum 1
   */
  minFit?: number;
  /** Write <locale>/assets.json, a manifest of every exported card (default true). */
  writeAssets?: boolean;
  /** Contact sheet file name per gallery, or false for none. */
  contactSheets?: Record<string, string | false>;
  /** Bezel and corner radius as fractions of a frame's width; `fixed` lists layouts whose CSS sizes frames. */
  frames?: false | FramesConfig;
  /** How far devices may leave the canvas, globally and per layout word, feature or gallery. */
  bounds?: BoundsRule & {layouts?: Record<string, BoundsRule | false>};
  /** Defaults for README name banners. */
  identity?: Identity;
  /** Real store cards joined edge to edge for a README. */
  readmeStrips?: ReadmeStrip[];
  /** fastlane / F-Droid metadata written by `export --fastlane`. */
  fastlane?: FastlaneConfig;
  /** How `recapture` builds, installs, captures and exports. */
  capture?: CaptureConfig;
}

export interface FramesConfig {
  phone?: FrameRatio;
  iphone?: FrameRatio;
  tablet?: FrameRatio;
  browser?: FrameRatio;
  landscape?: FrameRatio;
  /** Layouts whose CSS sizes their own frames. */
  fixed?: string[];
}
export interface FrameRatio {bezel: number; radius: number}

export interface BoundsRule {
  /** Pixels a frame keeps from the sides and top. */
  margin?: number;
  /**
   * The fraction of a frame that must stay on the canvas.
   * @minimum 0
   * @maximum 1
   */
  visible?: number;
  /** May leave either side. */
  sides?: boolean;
  /** May run off the right: true, or the fraction of its width. */
  right?: boolean | number;
  /** May hang from the top. */
  top?: boolean;
  /** A landscape screen may be cut at the top or bottom. */
  cut?: boolean;
}

/** A README name banner: the app's icon and name. */
export interface Identity {icon?: string; name?: string}

export interface ReadmeStrip {
  file: string;
  kind: string;
  /** @items {"type": "integer", "minimum": 0} */
  cards: number[];
  height?: number;
}

export interface FastlaneConfig {
  dir?: string;
  screenshots?: Record<string, string>;
  screenshotLocales?: 'all' | Locale[];
  locales?: Record<string, string>;
}

/** @additionalProperties true */
export interface CaptureConfig {
  /** Shell command that builds the capture app, run from the repository. */
  build?: string;
  /** Where captures come from: an Android emulator (the default) or an iOS simulator. */
  platform?: 'android' | 'ios';
  /** What to install before capturing: an APK (Android) or a simulator .app (iOS), with its package or bundle ID. */
  install?: CaptureInstall[];
  runs?: CaptureRun[];
  /**
   * Retries per capture run (default 2).
   * @asType integer
   * @minimum 0
   */
  retries?: number;
  /** Per-locale export command with {locale}, instead of the studio's exporter. */
  export?: string;
  /** Shell commands once everything is exported. */
  after?: string[];
  /**
   * The capture emulator (default: CAPTURE_SERIAL, then emulator-5578).
   * @pattern ^emulator-\d+$
   */
  serial?: string;
  /** The emulator image `recapture --boot` starts when none is running. */
  avd?: string;
  /** iOS: the simulator (name or UDID) for profiles that name none. */
  simulator?: string;
}
/**
 * An APK (Android) or a simulator .app (iOS) to install, with its package or bundle ID.
 * @anyOf [{"required": ["apk"]}, {"required": ["app"]}]
 */
export interface CaptureInstall {
  /** Android: the APK to install. */
  apk?: string;
  /** iOS: the simulator .app to install. */
  app?: string;
  package: string;
}
export interface CaptureRun {
  script?: string;
  args?: string[];
  /** For a capture.tour.mjs: values the tour reads as d.options. */
  options?: Record<string, unknown>;
  profiles?: false | string[];
  locales?: 'all' | 'default' | Locale[];
}

/** store-listing/profiles.json: one entry per gallery. */
export type Profiles = Record<string, Profile>;
export interface Profile {
  /**
   * The exported image's width.
   * @asType integer
   * @minimum 1
   */
  width: number;
  /**
   * @asType integer
   * @minimum 1
   */
  height: number;
  /**
   * The device display this gallery's captures are taken at.
   * @asType integer
   * @minimum 1
   */
  captureWidth?: number;
  /**
   * @asType integer
   * @minimum 1
   */
  captureHeight?: number;
  /**
   * @asType integer
   * @minimum 1
   */
  captureDensity?: number;
  frame?: FrameKind;
  /** The gallery's name in the editor. */
  label?: string;
  /** Render once, in the default language (README art, a share image). */
  defaultLocaleOnly?: boolean;
  /** Which capture backend takes this gallery's captures (default android). */
  platform?: 'android' | 'ios' | 'web';
  /** iOS: the simulator (name or UDID) this gallery is captured on. */
  simulator?: string;
}

/** store-listing/gallery.json: each gallery's cards. */
export type Galleries = Record<string, Gallery>;
/** A list of cards, or cards merged over another gallery's cards at the same positions. */
export type Gallery = Card[] | {
  /** Merge each card over this gallery's card at the same position. */
  inherits: string;
  cards: CardOverride[];
};
/** The fields a card changes in the inherited card at its position. */
export type CardOverride = Partial<Card>;

export interface Card {
  /**
   * The card's name; its words are copy.json[feature] (and copy.json["<gallery>/<feature>"]).
   * @pattern ^[A-Za-z0-9][A-Za-z0-9._/-]*$
   */
  feature: string;
  /** Words that become CSS classes on the card. */
  layout?: string;
  /** One capture, from <locale>/raw/. */
  raw?: string;
  frame?: FrameKind;
  /** Several captures. */
  devices?: DeviceSpec[];
  callouts?: Callout[];
  /**
   * Output name; .png writes PNG.
   * @pattern \.(jpe?g|png)$
   */
  file?: string;
  /** With a .png file: a 32-bit PNG. */
  transparent?: boolean;
  /** CSS custom properties for this card. */
  vars?: Record<string, string>;
  /** Replace the headline with a name banner. */
  identity?: boolean | Identity;
  bounds?: BoundsRule | false;
  /** false keeps the card to its own "<gallery>/<feature>" words. */
  sharedCopy?: boolean;
  alt?: string;
  /** Words merged in from copy.json. */
  title?: string;
  body?: string;
  tagline?: string;
  /** Anything else reaches the theme as ctx.slide. */
  [key: string]: unknown;
}

export interface DeviceSpec {
  raw: string;
  /** Becomes a CSS class; the theme places the device by it. */
  role?: string;
  frame?: FrameKind;
  /** A caption over the frame, with *highlight*. */
  label?: string;
  alt?: string;
  /** The profile whose capture ratio this device must have. */
  profile?: string;
  [key: string]: unknown;
}

/** A region of a real capture lifted out and magnified, in capture pixels. */
export interface Callout {
  x: number;
  y: number;
  /** @exclusiveMinimum 0 */
  w: number;
  /** @exclusiveMinimum 0 */
  h: number;
  /** @exclusiveMinimum 0 */
  mag?: number;
  /** @minimum 0 */
  radius?: number;
  dx?: number;
  dy?: number;
  /**
   * Which device on the card (default 0).
   * @asType integer
   * @minimum 0
   */
  device?: number;
  /** Another capture of the same scene. */
  raw?: string;
  /** Placement in canvas pixels, instead of over the device. */
  place?: {left: number; top: number; width: number};
  role?: string;
  /** A UI element path from the layout map; the callout follows it into every language. */
  target?: string;
  targetId?: string;
  targetClass?: string;
  targetMode?: 'element' | 'box';
}

/** <locale>/copy.json: words per card feature, or "<gallery>/<feature>" for one gallery. */
export type Copy = Record<string, CopyEntry>;
export interface CopyEntry {
  /** The headline: *highlight*, ~old~, [new], \n for a new line. */
  title?: string;
  body?: string;
  alt?: string;
  tagline?: string;
  [field: string]: string | undefined;
}

/** <locale>/listing.json */
export interface Listing {
  title?: string;
  appName?: string;
  shortDescription?: string;
  fullDescription?: string;
  /** The developer name the store shows under the title (the editor's store preview only). */
  developer?: string;
  [field: string]: unknown;
}

/** A capture's layout map, <name>.nodes.json: the app's UI elements in capture pixels. */
export interface UiTree {width?: number; height?: number; nodes: UiNode[]}
export interface UiNode {
  /** Position in the UI tree, stable between languages. */
  path: string;
  /** Bounds: left, top, right, bottom. */
  b: [number, number, number, number];
  text?: string;
  desc?: string;
  id?: string;
  cls?: string;
}

export interface Box {left: number; top: number; width: number; height: number}

/** What a theme's hooks receive. */
export interface ThemeContext {
  W: number;
  H: number;
  /** The gallery being rendered (phone, tablet7, readme…). */
  kind: string;
  locale: string;
  defaultLocale: string;
  /** This card's position in its gallery. */
  index: number;
  /** This card, with its words. */
  slide: Card;
  /** Every card in the gallery, with words. */
  slides: Card[];
  profile: Profile;
  profiles: Profiles;
  config: StudioConfig;
  /** The card's element. */
  main: HTMLElement;
  /** The background layer: art() returns its SVG. */
  art: SVGSVGElement;
  /** The first capture's image. */
  capture?: HTMLImageElement;
  /** From layout() on: every device, measured. */
  devices?: RenderedDevice[];
  device?: Box;
  screen?: Box;
}
export interface RenderedDevice {
  spec: DeviceSpec;
  node: HTMLElement;
  img: HTMLImageElement;
  locale: string | null;
  box: Box;
  screen: Box;
}

/** store-listing/theme.js's default export. Every hook is optional. */
export interface Theme {
  /** SVG for the background layer. */
  art?(ctx: ThemeContext): string | void;
  /** Add elements before captures load: a brand mark, panels, notes. */
  compose?(ctx: ThemeContext): void | Promise<void>;
  /** Adjust or redraw frames once captures have their size. */
  layout?(ctx: ThemeContext): void | Promise<void>;
  /** Final touches with devices measured; throw to fail the export. */
  decorate?(ctx: ThemeContext): void | Promise<void>;
  /** Called each time copy shrinks to fit. */
  refit?(ctx: ThemeContext): void | Promise<void>;
  /** The background runs across cards (all galleries, or these); the exporter checks the seams. */
  continuous?: boolean | string[];
  /**
   * Draw phones and tablets as real 3D devices (three.js), in every gallery or in these: each takes its frame's size,
   * corners and CSS `transform` as its pose, and `--device-body` as its color. A card opts out with the layout word `flat`.
   */
  depth?: boolean | string[];
}

/**
 * store-listing/capture.tour.mjs: how to reach each screen the cards need. The studio runs it for every language and
 * capture size (profiles.json entries with captureWidth, captureHeight and captureDensity), sets the emulator up (size,
 * density, 9:41 demo status bar, the app's language, light or dark), saves each scene as
 * <locale>/raw/<profile>/<scene>.png with its layout map, and puts everything back afterwards.
 *   /** @type {import('./studio/types').Tour} *\/
 *   export default {app: 'com.example.app.storecapture', scenes: {light: {'01-home': null, '02-settings': d => d.tap('Settings')}}};
 */
export interface Tour {
  /** The app's package (the capture build's). */
  app: string;
  /** Its launch activity, when the package has several (`.MainActivity` or the full name). */
  activity?: string;
  /**
   * Scenes per theme, in order: each says how to reach its screen from the previous one, then the studio saves it.
   * `null` saves the screen as it is; return `false` to skip a scene for this profile or language.
   */
  scenes: Partial<Record<'light' | 'dark', Record<string, TourStep | null>>>;
  /** Before each profile's run of a theme's scenes. Default: launch the app with its data cleared. */
  start?: TourStep;
  /** Once per language, before the first profile (install fixtures, say), and after the last. */
  setup?: TourStep;
  teardown?: TourStep;
  /** Instead of scenes: drive everything yourself, calling d.shot(). For apps that capture with their own test. */
  run?: TourStep;
  /** Milliseconds to let the screen settle before each scene is saved (default 1200). */
  settle?: number;
  /** Set the app's language for each capture (default true). */
  appLocale?: boolean;
  /** Wi-Fi and mobile data off while capturing (default true). */
  offline?: boolean;
  /** Keep animations on (default true). */
  animations?: boolean;
  /** Record taps in the default language and replay them by position in the others (default true). */
  tapMap?: boolean;
}
export type TourStep = (d: TourDevice) => unknown;

/** What a tour drives: the capture emulator, set up for one language, profile and theme. */
export interface TourDevice {
  app: string;
  locale: string;
  defaultLocale: string;
  /** The profile being captured (phone, tablet7…) and its display size in pixels. */
  profile: string;
  width: number;
  height: number;
  theme: 'light' | 'dark';
  serial: string;
  /** The run's options from studio.json ("capture": {"runs": [{"options": {...}}]}). */
  options: Record<string, unknown>;
  /** Start the app fresh: force-stopped, data cleared when `clear` (its language set again), intent extras passed. */
  launch(options?: {clear?: boolean; wait?: number; activity?: string; extras?: Record<string, string | number | boolean>}): Promise<void>;
  /** Tap the element whose text (or description, unless textOnly) is `label`, a regular expression matched whole. */
  tap(label: string | RegExp, options?: {textOnly?: boolean; wait?: number; attempts?: number; key?: string; within?: (bounds: [number, number, number, number]) => boolean}): Promise<void>;
  tapAt(x: number, y: number, wait?: number): Promise<void>;
  /** Whether `label` is on screen now (matched in every language as written, not through the tap map). */
  present(label: string | RegExp, options?: {textOnly?: boolean}): Promise<boolean>;
  waitFor(label: string | RegExp, options?: {textOnly?: boolean; timeout?: number}): Promise<void>;
  back(wait?: number): Promise<void>;
  /** Swipe up by `fraction` of the screen height from `start` (down with `up: true`). */
  scroll(fraction?: number, options?: {start?: number; x?: number; up?: boolean; duration?: number; wait?: number}): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, options?: {duration?: number; wait?: number}): Promise<void>;
  type(text: string): Promise<void>;
  night(on: boolean): Promise<void>;
  rotate(landscape: boolean): Promise<void>;
  /** The emulator's clock at hh:mm today (default 9:41, matching the status bar). */
  setClock(hhmm?: string): void;
  /** Save the screen now as <locale>/raw/<profile>/<name>.png with its layout map (scenes do this for you). */
  shot(name: string, options?: {settle?: number}): Promise<string>;
  /** The UI tree now, each element with its path, bounds, text, description, ID and class. */
  tree(): Promise<UiNode[]>;
  /** Run a Screenshot Studio command from the listing, e.g. d.studio('fixtures', 'fixture-apps.json', '--install', d.serial). */
  studio(...args: string[]): void;
  /** adb on the emulator, for anything else: d.shell('pm', 'grant', d.app, 'android.permission.POST_NOTIFICATIONS'). */
  shell(...words: (string | number)[]): string;
  adb(...words: (string | number)[]): string;
  sleep(ms: number): Promise<void>;
}

/** Boxes on the finished card, in card pixels (left, top, width, height). */
export interface CardLayout {
  width: number;
  height: number;
  devices: (Box & {raw: string; role?: string})[];
  header?: Box;
  callouts: Box[];
}

/** What the renderer reports for one card. */
export interface CardReport {
  locale: string;
  missingCopy: string[];
  fallbackCaptures: string[];
  movedCallouts: number[];
  fixedCallouts: number[];
  /** The scale copy was shrunk to (1 = not shrunk, 0 = does not fit). */
  fit: number;
  continuous?: boolean;
  /** Last words left alone on their own line. */
  widows?: string[];
  /** Where everything landed, in card pixels: for adjusting a layout by numbers rather than by eye. */
  layout?: CardLayout;
}
