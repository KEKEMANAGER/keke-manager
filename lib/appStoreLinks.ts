/** Where the KEKE Manager app lives in the stores. */
export const ANDROID_PACKAGE = 'com.keke.manager';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
/** Opens the Play Store app itself on an Android phone. */
export const PLAY_STORE_MARKET_URL = `market://details?id=${ANDROID_PACKAGE}`;
export const APP_STORE_URL = 'https://apps.apple.com/app/keke-manager/id6809557226';

/** Which store buttons a browser should offer: a phone gets its own store, a computer both. */
export function storesForUserAgent(userAgent: string | null | undefined): ('play' | 'apple')[] {
  const ua = String(userAgent ?? '');
  if (/iPhone|iPad|iPod/i.test(ua)) return ['apple'];
  if (/Android/i.test(ua)) return ['play'];
  return ['play', 'apple'];
}
