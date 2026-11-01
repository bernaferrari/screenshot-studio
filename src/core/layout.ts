// The renderer's rules, without a page: how headline markup reads, how big a frame's bezel is, where a callout
// sits, how far a device may leave the card, and when a last line is too short. The renderer applies them to the
// DOM; tests call them directly.
import type {BoundsRule, Box, FrameKind, FrameRatio, FramesConfig, StudioConfig} from './types';

/** A run of headline text: plain, *highlighted* (em), ~struck out~ (del) or [inserted] (ins). */
export interface Run {text: string; tag?: 'em' | 'del' | 'ins'}

const TAGS: Record<string, Run['tag']> = {'*': 'em', '~': 'del', '[': 'ins'};

/** Headline markup shared by every app: *highlight*, ~struck out~, [inserted], and \n for a new line. */
export function parseHeadline(title: string): Run[][] {
  return title.split('\n').map(line => line.split(/(\*[^*]+\*|~[^~]+~|\[[^\]]+\])/).filter(Boolean).map(part => {
    const tag = TAGS[part[0]];
    return tag && part.length > 2 ? {text: part.slice(1, -1), tag} : {text: part};
  }));
}

/** Text with only *highlight* markup: device labels and README taglines. */
export function parseHighlight(text: string): Run[] {
  return text.split(/(\*[^*]+\*)/).filter(Boolean).map(part => part.startsWith('*') && part.length > 2 ? {text: part.slice(1, -1), tag: 'em' as const} : {text: part});
}

/** The headline as plain words, for alt text. */
export const plainHeadline = (title: string) => title.replace(/[*~[\]]/g, '').replaceAll('\n', ' ');

/**
 * Frames scale with their width: bezel and corner radius as fractions of the frame width, per frame and for
 * landscape captures in a phone or tablet frame. studio.json "frames" overrides any of them; "fixed" lists layouts
 * whose CSS sizes its own frames; "frames": false turns scaling off.
 */
export const FRAMES: Required<Omit<FramesConfig, 'browser'>> = {
  phone: {bezel: .02, radius: .09}, iphone: {bezel: .016, radius: .15}, tablet: {bezel: .018, radius: .05}, landscape: {bezel: .012, radius: .035}, fixed: [],
};

const HANDHELD: FrameKind[] = ['phone', 'iphone', 'tablet'];

/** The bezel and radius in pixels for a frame this wide, or null when its CSS sizes it. */
export function frameSize(config: StudioConfig, frame: FrameKind, landscape: boolean, width: number, layoutWords: string[]): {bezel: number; radius: number} | null {
  if (config.frames === false || frame === 'none') return null;
  const frames = {...FRAMES, ...config.frames};
  if (layoutWords.some(word => (frames.fixed || []).includes(word))) return null;
  const ratio: FrameRatio | undefined = frames[HANDHELD.includes(frame) && landscape ? 'landscape' : frame];
  return ratio ? {bezel: Math.round(width * ratio.bezel), radius: Math.round(width * ratio.radius)} : null;
}

/**
 * Layouts whose device leaves the canvas by design: the README spread's tablet runs off the right, a `hang` card's
 * device hangs from the top with the copy underneath, and the short feature graphic shows only a phone's top.
 */
export const LAYOUT_BOUNDS: Record<string, BoundsRule | false> = {spread: {right: true}, hang: {top: true}, feature: {visible: .3}};

export type Bounds = Required<Pick<BoundsRule, 'margin' | 'visible'>> & BoundsRule;

/**
 * The bounds a card's devices keep, or null when a rule turns the checks off. studio.json "bounds" sets the base and,
 * under "layouts", rules per layout word; the card's own "bounds" goes last.
 */
export function boundsFor(config: StudioConfig, layoutWords: string[], own?: BoundsRule | false): Bounds | null {
  const {layouts, ...base} = {margin: 0, visible: .6, ...config.bounds};
  const byWord = {...LAYOUT_BOUNDS, ...layouts};
  const rules = [base, ...layoutWords.map(word => byWord[word]), own].filter(rule => rule !== undefined);
  return rules.includes(false) ? null : Object.assign({}, ...rules);
}

/** Why the device showing `raw` breaks its bounds on a W×H card, or null when it keeps them. */
export function boundsProblem(box: Box, frame: FrameKind, rule: Bounds, W: number, H: number, raw: string): string | null {
  if (frame === 'none') return null;
  const m = rule.margin;
  const overRight = box.left + box.width - (W - m);
  if (!rule.sides && (box.left < m - .5 || (overRight > .5 && !(rule.right === true || overRight / box.width <= (Number(rule.right) || 0)))))
    return `Screen leaves the side of the card: ${raw}`;
  if (!rule.top && box.top < m - .5) return `Screen leaves the top of the card: ${raw}`;
  if ((Math.min(box.top + box.height, H) - Math.max(box.top, 0)) / box.height < rule.visible) return `Too little of ${raw} is visible`;
  if (!rule.cut && HANDHELD.includes(frame) && box.width > box.height && (box.top < -.5 || box.top + box.height > H + 1)) return `Landscape tablet is cut: ${raw}`;
  return null;
}

/** A region of a capture, in capture pixels. */
export interface Region {x: number; y: number; w: number; h: number}

/**
 * Where a callout sits on the card and how much it is scaled: at `place` when given, otherwise centred over where
 * its region lives on the screen, magnified by `mag` (1.1) and nudged by dx, dy.
 */
export function calloutPlacement(region: Region, captureWidth: number, screen: Box, options: {mag?: number; dx?: number; dy?: number; place?: {left: number; top: number; width: number}}): {left: number; top: number; scale: number} {
  if (options.place) return {left: options.place.left, top: options.place.top, scale: options.place.width / region.w};
  const fit = screen.width / captureWidth;
  const scale = fit * (options.mag || 1.1);
  return {
    left: screen.left + (region.x + region.w / 2) * fit + (options.dx || 0) - region.w * scale / 2,
    top: screen.top + (region.y + region.h / 2) * fit + (options.dy || 0) - region.h * scale / 2,
    scale,
  };
}

/** A short last line ("…all\nbuilt in.") reads as a mistake at thumbnail size. Widths are the wrapped lines'. */
export const isWidow = (lineWidths: number[]) => lineWidths.length > 1 && lineWidths[lineWidths.length - 1] < Math.max(...lineWidths) * .3;

/** Whether a capture keeps a real device ratio: its own profile's, or one of the configured capture sizes either way up. */
export function hasDeviceRatio(width: number, height: number, ratios: number[], expected?: number | null): boolean {
  const ratio = width / height;
  return expected ? Math.abs(ratio - expected) <= .001 : ratios.some(r => Math.abs(ratio - r) < .001);
}
