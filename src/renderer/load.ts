// Everything one card needs before anything is drawn: the listing's files, the card with its words in this
// language, and the app's theme.
import {cardsFor, withCopy, withoutMeta} from '../core/gallery';
import type {Card, CardReport, Copy, Galleries, Profile, Profiles, StudioConfig, Theme} from '../core/types';

export async function json<T>(file: string): Promise<T>;
export async function json<T>(file: string, optional: true): Promise<T | null>;
export async function json<T>(file: string, optional = false): Promise<T | null> {
  const response = await fetch(file);
  if (!response.ok) {
    if (optional) return null;
    throw new Error(`Cannot load ${file}`);
  }
  return withoutMeta(await response.json());
}

export interface Loaded {
  config: StudioConfig;
  profiles: Profiles;
  locale: string;
  defaultLocale: string;
  kind: string;
  profile: Profile;
  /** Every card of the gallery, with its words. */
  slides: Card[];
  index: number;
  slide: Card;
  /** What fell back to the default language, for the editor and the exporter. */
  report: CardReport;
  theme: Theme;
}

/** The card a preview.html address asks for: ?locale=de-DE&kind=phone&slide=0. */
export async function loadCard(q: URLSearchParams): Promise<Loaded> {
  const config = await json<StudioConfig>('../studio.json');
  const defaultLocale = config.defaultLocale || 'en-US';
  const locale = q.get('locale') || defaultLocale;
  const [galleries, profiles, copy, defaultCopy] = await Promise.all([json<Galleries>('../gallery.json'), json<Profiles>('../profiles.json'),
    json<Copy>(`../${locale}/copy.json`, true), json<Copy>(`../${defaultLocale}/copy.json`, true)]);
  const kind = q.get('kind') || Object.keys(galleries)[0];
  const profile = profiles[kind];
  if (!profile) throw new Error(`No profile for ${kind}`);
  const fallback = locale === defaultLocale ? {} : defaultCopy || {};
  const cards = cardsFor(galleries, kind);
  const index = Math.max(0, Math.min(cards.length - 1, Number(q.get('slide') || 0)));
  const {card: slide, missing} = withCopy(cards[index], kind, copy || {}, fallback);
  // The app's theme sits beside the studio folder and loads at runtime (the build keeps it external). A theme may be
  // CSS alone, without a theme.js.
  const theme: Theme = (await fetch('../theme.js', {method: 'HEAD'})).ok ? (await import(/* @vite-ignore */ '../theme.js' as string)).default || {} : {};
  return {
    config, profiles, locale, defaultLocale, kind, profile, index, slide, theme,
    slides: cards.map(card => withCopy(card, kind, copy || {}, fallback).card),
    report: {locale, missingCopy: copy ? missing : ['copy.json'], fallbackCaptures: [], movedCallouts: [], fixedCallouts: [], fit: 1},
  };
}
