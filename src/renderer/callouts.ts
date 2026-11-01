// Callouts lift a region of a real capture out of its screen, centred where it lives. Boxes are drawn on the default
// language's capture; in other languages they follow the same UI element through the layout sidecars. A callout may
// also come from another capture of the same scene (`raw`, e.g. a notification shade or a dialog), placed on the
// card with `place: {left, top, width}` in canvas pixels.
import {followCallout, nodesFile} from '../core/gallery';
import {calloutPlacement} from '../core/layout';
import type {Box, Callout, CardReport, RenderedDevice, UiTree} from '../core/types';
import type {LoadCapture} from './devices';
import {json} from './load';

interface Source {img: HTMLImageElement; spec: {raw: string}; locale: string | null; screen?: Box}

export interface CalloutScene {
  main: HTMLElement;
  measured: RenderedDevice[];
  /** The primary screen, where callouts from other captures sit by default. */
  screen?: Box;
  defaultLocale: string;
  load: LoadCapture;
  report: CardReport;
}

export async function drawCallouts(callouts: Callout[], scene: CalloutScene) {
  const {main, measured, defaultLocale, load, report} = scene;
  const sources = new Map<string, Promise<Source>>();
  const sourceFor = (raw: string): Promise<Source> => {
    if (!sources.has(raw)) {
      const img = new Image();
      sources.set(raw, load(img, raw).then(async capturedIn => {
        if (!capturedIn) throw new Error(`Missing callout capture ${raw}`);
        await img.decode();
        return {img, spec: {raw}, locale: capturedIn};
      }));
    }
    return sources.get(raw)!;
  };
  for (const [index, c] of callouts.entries()) {
    const source: Source = c.raw ? await sourceFor(c.raw) : measured[c.device || 0];
    let box = {x: c.x, y: c.y, w: c.w, h: c.h, target: c.target, targetId: c.targetId, targetClass: c.targetClass, targetMode: c.targetMode};
    if (source.locale !== defaultLocale || c.targetMode === 'element') {
      const reference = await json<UiTree>(`../${defaultLocale}/raw/${nodesFile(source.spec.raw)}`, true);
      const localized = source.locale === defaultLocale ? reference : await json<UiTree>(`../${source.locale}/raw/${nodesFile(source.spec.raw)}`, true);
      const sizeMatches = localized?.width === source.img.naturalWidth && localized?.height === source.img.naturalHeight;
      const moved = c.targetMode === 'element' && !sizeMatches ? null : followCallout(box, reference, localized);
      if (moved) { box = {...box, ...moved}; if (source.locale !== defaultLocale) report.movedCallouts.push(index); }
      else if (c.targetMode === 'element' && source.locale === defaultLocale) throw new Error(`The selected accessibility element is missing or incompatible in ${source.spec.raw}. Pick the element again.`);
      else report.fixedCallouts.push(index);
    }
    const {left, top, scale: k} = calloutPlacement(box, source.img.naturalWidth, (source.screen || scene.screen)!, c);
    const el = document.createElement('div');
    el.className = `callout${c.role ? ` ${c.role}` : ''}`;
    el.dataset.checkBounds = '';
    Object.assign(el.style, {
      width: `${box.w * k}px`, height: `${box.h * k}px`, left: `${left}px`, top: `${top}px`,
      borderRadius: `${(c.radius || 0) * k}px`, backgroundImage: `url("${source.img.src}")`,
      backgroundSize: `${source.img.naturalWidth * k}px auto`, backgroundPosition: `${-box.x * k}px ${-box.y * k}px`,
    });
    main.append(el);
  }
}
