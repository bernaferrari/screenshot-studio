/**
 * The review queue: everything in a listing that needs fixing, in one list. It joins the fast file check
 * (checkListing) with what the last export noticed: per-card notes from <locale>/assets.json and the warnings and
 * error in export-report.json. Each issue says which card it concerns when that can be known, so the editor can link
 * to it.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {Galleries, StudioConfig} from '../../core/types';
import {cardsFor, outputFile} from '../../core/gallery';
import {checkListing} from '../check';
import type {CheckResult} from '../check';
import {readJson} from '../project';

/** export-report.json: the last `export`'s ExportResult (the parts read here), with when and how it ran. */
export interface ExportReport {
  ok: boolean;
  error?: string;
  warnings?: string[];
  cards?: unknown[];
  locales?: {locale: string}[];
  finishedAt: string;
  options?: {locales?: string[]; kind?: string; card?: number; strict?: boolean};
}

export interface ReviewIssue {
  /** Stable within one review, for lists. */
  id: string;
  /** `check` reads the files; `export` is what the last render noticed. */
  source: 'check' | 'export';
  level: 'error' | 'warning' | 'info';
  /** Relative to store-listing/; empty when the issue is about the export as a whole. */
  file: string;
  /** Where in the file, as a JSON path. */
  path?: string;
  message: string;
  /** What to do about it. */
  fix?: string;
  /** The card it concerns, when known. */
  card?: {kind: string; index: number; feature: string};
  locale?: string;
}

export interface Review {
  checkedAt: string;
  check: Pick<CheckResult, 'ok' | 'counted'>;
  lastExport: {finishedAt: string; ok: boolean; error?: string; cards: number; locales: string[]; options?: ExportReport['options']} | null;
  issues: ReviewIssue[];
}

interface ManifestCard {file: string; feature: string; slide: number; notes?: string[]}

const noteFix = (note: string, reference: string): {level: ReviewIssue['level']; fix: string} =>
  note.startsWith('untranslated') ? {level: 'warning', fix: 'Translate these words in Languages, or in the card inspector.'}
  : note.startsWith(`${reference} capture`) ? {level: 'warning', fix: 'Capture this language (`npx screenshot-studio recapture`) so the card shows its own screen.'}
  : note.startsWith('callout') ? {level: 'warning', fix: 'The callout\'s UI element wasn\'t found in this language. Pick the callout again on an element both languages share.'}
  : note.startsWith('copy shrunk') ? {level: 'info', fix: 'Shorter words keep the headline at full size.'}
  : {level: 'warning', fix: ''};

/** A JSON file the studio writes, or null when it is missing or unreadable. */
function optionalJson<T>(file: string): T | null {
  try { return readJson<T | null>(file, null); } catch { return null; }
}

/** Everything to fix in the listing at `listing` (a store-listing folder). */
export function reviewListing(listing: string): Review {
  listing = path.resolve(listing);
  const check = checkListing(listing);
  const issues: ReviewIssue[] = [];
  const galleries = optionalJson<Galleries>(path.join(listing, 'gallery.json')) || {};
  const config = optionalJson<StudioConfig>(path.join(listing, 'studio.json')) || {};
  const reference = config.defaultLocale || 'en-US';
  const cards = (kind: string) => { try { return galleries[kind] ? cardsFor(galleries, kind) : []; } catch { return []; } };
  const card = (kind: string, index: number): ReviewIssue['card'] => {
    const found = cards(kind)[index];
    return found ? {kind, index, feature: found.feature} : undefined;
  };
  const byFeature = (kind: string, feature: string): ReviewIssue['card'] => {
    const index = cards(kind).findIndex(c => c.feature === feature);
    return index < 0 ? undefined : {kind, index, feature};
  };

  check.issues.forEach((issue, n) => {
    let concerns: ReviewIssue['card'];
    // gallery.json paths start with the card: phone[2].devices[0].raw
    const at = issue.file === 'gallery.json' && issue.path?.match(/^([A-Za-z0-9_-]+)\[(\d+)\]/);
    if (at) concerns = card(at[1], Number(at[2]));
    const named = issue.message.match(/card "([^"]+)" \(([^)]+)\)/);
    if (!concerns && named) concerns = byFeature(named[2], named[1]);
    const locale = issue.file.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\//)?.[1];
    issues.push({id: `check-${n}`, source: 'check', level: issue.level, file: issue.file, ...(issue.path ? {path: issue.path} : {}),
      message: issue.message, ...(issue.fix ? {fix: issue.fix} : {}), ...(concerns ? {card: concerns} : {}), ...(locale ? {locale} : {})});
  });

  // Per-card notes from each language's last export.
  for (const locale of config.locales || [reference]) {
    const manifest = optionalJson<{galleries?: Record<string, ManifestCard[]>}>(path.join(listing, locale, 'assets.json'));
    for (const [kind, entries] of Object.entries(manifest?.galleries || {})) {
      for (const entry of entries) for (const [n, note] of (entry.notes || []).entries()) {
        const {level, fix} = noteFix(note, reference);
        issues.push({id: `notes-${locale}-${kind}-${entry.slide}-${n}`, source: 'export', level, file: `${locale}/${entry.file}`, message: note,
          ...(fix ? {fix} : {}), locale, card: card(kind, entry.slide) || {kind, index: entry.slide, feature: entry.feature}});
      }
    }
  }

  const report = optionalJson<ExportReport>(path.join(listing, 'export-report.json'));
  if (report) {
    if (report.error) issues.push({id: 'export-error', source: 'export', level: 'error', file: '', message: report.error,
      fix: 'Fix what it names, then export again (`npx screenshot-studio export`).'});
    (report.warnings || []).forEach((warning, n) => {
      const seam = warning.match(/^([^/]+)\/([^:]+): the background breaks at the seam between cards (\d+) and (\d+)/);
      const stale = warning.match(/^(.+) is no longer in the gallery; delete it$/);
      const limit = warning.match(/^(\S+\/listing\.json) (\w+) has/);
      // Card warnings start with the card's output: "de-DE/phone/02-logs.jpg: …"
      const output = warning.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\/(\S+?\.(?:jpe?g|png|webp)): /);
      const byOutput = output ? Object.keys(galleries).flatMap(kind => cards(kind).map((c, i) => ({kind, i, file: outputFile(kind, c, i)}))).find(o => o.file === output[2]) : undefined;
      const base = {id: `export-warning-${n}`, source: 'export' as const, level: 'warning' as const, message: warning};
      if (seam) issues.push({...base, file: 'theme.js', locale: seam[1], card: card(seam[2], Number(seam[3]) - 1),
        fix: 'Draw the background in panorama coordinates (studio/shapes.js) so it continues from one card into the next.'});
      else if (stale) issues.push({...base, file: stale[1], fix: 'Delete the file; no card writes it any more.'});
      else if (limit) issues.push({...base, file: limit[1], path: limit[2], fix: 'Shorten it to fit Play\'s limit.'});
      else if (output) issues.push({...base, message: warning.slice(output[0].length), file: `${output[1]}/${output[2]}`, locale: output[1], ...(byOutput ? {card: card(byOutput.kind, byOutput.i)} : {}),
        ...(/short last line/.test(warning) ? {fix: 'Reword or shorten the words so the last line isn\'t a lone word or two.'} : {})});
      else issues.push({...base, file: ''});
    });
  }
  const rank = {error: 0, warning: 1, info: 2};
  issues.sort((a, b) => rank[a.level] - rank[b.level]);
  return {
    checkedAt: new Date().toISOString(),
    check: {ok: check.ok, counted: check.counted},
    lastExport: report ? {finishedAt: report.finishedAt || fs.statSync(path.join(listing, 'export-report.json')).mtime.toISOString(), ok: report.ok,
      ...(report.error ? {error: report.error} : {}), cards: report.cards?.length || 0, locales: (report.locales || []).map(tally => tally.locale), ...(report.options ? {options: report.options} : {})} : null,
    issues,
  };
}
