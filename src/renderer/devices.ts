// The card's devices: a frame per capture, loaded from this language's raw/ folder (or the default language's while
// it is missing), checked for a real device ratio, sized, measured, labelled and kept within the card.
import {devicesFor} from '../core/gallery';
import {boundsFor, boundsProblem, frameSize, hasDeviceRatio, parseHighlight} from '../core/layout';
import type {Box, Card, CardReport, DeviceSpec, FrameKind, Profile, Profiles, RenderedDevice, StudioConfig} from '../core/types';
import {appendRuns} from './text';

/** Loads captures by name, falling back to the default language and noting each fallback in the report. */
export function captureLoader(locale: string, defaultLocale: string, report: CardReport) {
  /** Resolves to the language the capture came from, or null when neither has it. */
  return (img: HTMLImageElement, raw: string) => new Promise<string | null>(resolve => {
    img.onload = () => resolve(img.dataset.fallback ? defaultLocale : locale);
    img.onerror = () => {
      if (img.dataset.fallback) return resolve(null);
      img.dataset.fallback = 'true';
      report.fallbackCaptures.push(raw);
      img.src = `../${defaultLocale}/raw/${raw}`;
    };
    img.src = `../${locale}/raw/${raw}`;
  });
}
export type LoadCapture = ReturnType<typeof captureLoader>;

export interface Device {spec: DeviceSpec; frame: FrameKind; node: HTMLElement; img: HTMLImageElement; loaded: Promise<string | null>}

/** A frame element per capture on the card, appended to main; captures start loading. */
export function createDevices(main: HTMLElement, slide: Card, profile: Profile, load: LoadCapture): Device[] {
  return devicesFor(slide).map((spec, i) => {
    const frame = spec.frame || profile.frame || 'phone';
    const node = document.createElement('div');
    node.className = `device ${spec.role || (i === 0 ? 'primary' : `device-${i + 1}`)} device-frame-${frame}`;
    node.innerHTML = '<div class="screen"><img data-app-capture alt=""></div>';
    if (frame === 'browser') node.insertAdjacentHTML('beforeend', '<div class="dots"><i></i><i></i><i></i></div>');
    const img = node.querySelector('img')!;
    img.alt = spec.alt || `${slide.feature}: the real app with example data`;
    main.append(node);
    return {spec, frame, node, img, loaded: load(img, spec.raw)};
  });
}

/** Wait for every capture; fail on one that is missing or not a configured device ratio. */
export async function settleDevices(devices: Device[], profiles: Profiles): Promise<(string | null)[]> {
  const locales = await Promise.all(devices.map(d => d.loaded));
  devices.forEach((d, i) => { if (!locales[i]) throw new Error(`Missing capture ${d.spec.raw}`); });
  await Promise.all([...document.images].map(image => image.decode()));
  await document.fonts.ready;
  const ratios = Object.values(profiles).filter(p => p.captureWidth && p.captureHeight).flatMap(p => [p.captureWidth! / p.captureHeight!, p.captureHeight! / p.captureWidth!]);
  for (const {img, spec} of devices) {
    const own = spec.profile ? profiles[spec.profile] : null;
    const expected = own?.captureWidth && own.captureHeight ? own.captureWidth / own.captureHeight : null;
    if (!hasDeviceRatio(img.naturalWidth, img.naturalHeight, ratios, expected))
      throw new Error(`Recapture ${spec.raw}: ${img.naturalWidth}×${img.naturalHeight} is not a configured device ratio`);
  }
  return locales;
}

/** Mark each frame portrait or landscape, and set its bezel and radius from its width. */
export function sizeFrames(devices: Device[], config: StudioConfig, layoutWords: string[]) {
  for (const d of devices) {
    const landscape = d.img.naturalWidth > d.img.naturalHeight;
    d.node.classList.add(landscape ? 'device-landscape' : 'device-portrait');
    const size = frameSize(config, d.frame, landscape, d.node.clientWidth, layoutWords);
    if (!size) continue;
    d.node.style.setProperty('--bezel', `${size.bezel}px`);
    d.node.style.setProperty('--radius', `${size.radius}px`);
  }
}

/** An element's box relative to the card. */
export function relative(main: HTMLElement, element: Element): Box {
  const canvas = main.getBoundingClientRect(), r = element.getBoundingClientRect();
  return {left: r.left - canvas.left, top: r.top - canvas.top, width: r.width, height: r.height};
}

export function measure(main: HTMLElement, devices: Device[], locales: (string | null)[]): RenderedDevice[] {
  return devices.map(({spec, node, img}, i) => ({spec, node, img, locale: locales[i] ?? null, box: relative(main, node), screen: relative(main, node.querySelector('.screen')!)}));
}

/**
 * A device may carry a label (a before/after pair, say): a caption centred above the frame, styled by the theme.
 * A theme can set it under its frame instead: transform: translateY(calc(var(--device-height) + 30px)), or under
 * the card's tallest frame (--tallest-device), so a row of labels lines up.
 */
export function labelDevices(main: HTMLElement, measured: RenderedDevice[]) {
  const tallest = Math.max(...measured.map(d => d.box.height));
  for (const {spec, box} of measured) {
    if (!spec.label) continue;
    const label = document.createElement('div');
    label.className = `device-label${spec.role ? ` ${spec.role}` : ''}`;
    label.dataset.checkBounds = '';
    const span = document.createElement('span');
    appendRuns(span, parseHighlight(spec.label));
    label.append(span);
    Object.assign(label.style, {left: `${box.left}px`, width: `${box.width}px`, top: `${box.top}px`});
    label.style.setProperty('--device-height', `${box.height}px`);
    label.style.setProperty('--tallest-device', `${tallest}px`);
    main.append(label);
  }
}

/**
 * Fail when a device leaves the card further than its layout allows. A frame keeps `margin` px from the sides and
 * top, shows at least `visible` of itself, and a landscape screen in a phone or tablet frame is never cut at the top
 * or bottom, unless studio.json "bounds", a layout word or the card's own "bounds" says otherwise.
 */
export function checkBounds(measured: RenderedDevice[], slide: Card, profile: Profile, config: StudioConfig, layoutWords: string[]) {
  const rule = boundsFor(config, layoutWords, slide.bounds);
  if (!rule) return;
  for (const {box, spec} of measured) {
    const problem = boundsProblem(box, spec.frame || profile.frame || 'phone', rule, profile.width, profile.height, spec.raw);
    if (problem) throw new Error(problem);
  }
}
