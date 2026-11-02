// The stores' rules for listing text, so check and export hold a listing to the store it's for.
import type {Listing, Profile, Profiles, StudioConfig} from './types';

export type Store = 'Google Play' | 'App Store';

/** Field → most characters allowed. */
const LIMITS: Record<Store, Record<string, number>> = {
  // https://support.google.com/googleplay/android-developer/answer/9859152
  'Google Play': {title: 30, shortDescription: 80, fullDescription: 4000},
  // https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
  'App Store': {title: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000},
};

/** Which store a listing is for: the App Store when its capture or galleries are iOS, Google Play otherwise. */
export function storeFor(config: StudioConfig, profiles: Profiles): Store {
  const ios = (config.capture as {platform?: string} | undefined)?.platform === 'ios' ||
    Object.values(profiles).some(profile => (profile as {platform?: string}).platform === 'ios');
  return ios ? 'App Store' : 'Google Play';
}

/** The most screenshots a store takes per device type. */
export const SCREENSHOT_LIMIT: Record<Store, number> = {'Google Play': 8, 'App Store': 10};

/** Whether a gallery's cards upload to the store: fastlane's screenshot folders when set, else Play's phone and tablets and the iOS galleries. */
export function isStoreGallery(kind: string, profile: Profile, config: StudioConfig): boolean {
  if (profile.defaultLocaleOnly) return false;
  if (config.fastlane?.screenshots) return kind in config.fastlane.screenshots;
  return profile.platform === 'ios' || ['phone', 'tablet7', 'tablet10'].includes(kind);
}

export interface TextProblem {field: string; length: number; max: number; message: string}

/** Fields of listing.json over the store's limits. `appName` counts as the title. */
export function listingProblems(words: Listing, store: Store): TextProblem[] {
  const problems: TextProblem[] = [];
  for (const [field, max] of Object.entries(LIMITS[store])) {
    const value = field === 'title' ? words.title ?? words.appName : words[field];
    const length = typeof value === 'string' ? [...value].length : 0;
    if (length > max) problems.push({field, length, max, message: `${field} has ${length} characters; ${store} allows ${max}`});
  }
  return problems;
}
