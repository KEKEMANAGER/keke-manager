/**
 * A Google Maps link a company pastes for a hotel or a street address.
 *
 * Bookings name their places as text, and the driver's navigation button sent
 * that text to Google Maps to search. A hotel name that is misspelt, or shared
 * by several places, took the driver to the wrong door — on a tour that does
 * not end in Tbilisi, to the wrong town. The place's own Google Maps link
 * ("Share" → "Copy link") points at one exact spot and costs nothing: no API,
 * no key. The driver's button opens it as it is.
 *
 * Kept free of React Native so it can be checked on its own.
 */

const MAX_LINK_LENGTH = 2048;

/** Hotels and street addresses. Airports and stations come from a fixed list. */
export function locationTypeTakesMapLink(type: string | null | undefined): boolean {
  return type === 'hotel' || type === 'address';
}

function firstUrlIn(text: string): string | null {
  const withScheme = /https?:\/\/[^\s<>"'`]+/i.exec(text);
  if (withScheme) return withScheme[0];
  // Copied from an address bar some browsers drop the scheme.
  const bare =
    /(?:^|[\s(])((?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?)\/[^\s<>"'`]*)/i.exec(
      text,
    );
  return bare ? `https://${bare[1]}` : null;
}

/** True for a link that opens Google Maps itself, not a search page or another site. */
export function isGoogleMapsUrl(url: string): boolean {
  const m = /^https:\/\/([^/?#]+)([^?#]*)/i.exec(url);
  if (!m) return false;
  const host = m[1].toLowerCase();
  const path = m[2] || '/';
  // No user:password@ and no port: a link that hides where it goes is refused.
  if (host.includes('@') || host.includes(':')) return false;
  if (host === 'maps.app.goo.gl') return path.length > 1;
  if (host === 'goo.gl') return /^\/maps\/./i.test(path);
  if (/^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return true;
  if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return /^\/maps(\/|$)/i.test(path);
  return false;
}

/**
 * The Google Maps link in whatever was pasted, or null.
 *
 * "Share" in the Google Maps app copies the place's name and address along with
 * the link, so the link is picked out of the text rather than demanded alone.
 */
export function extractGoogleMapsLink(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  const found = firstUrlIn(text);
  if (!found) return null;
  const url = found.replace(/[).,;:!?\]}'"»]+$/u, '').replace(/^http:\/\//i, 'https://');
  if (url.length > MAX_LINK_LENGTH) return null;
  return isGoogleMapsUrl(url) ? url : null;
}

export type MapLinkState = 'empty' | 'valid' | 'invalid';

/** What the company has typed: nothing, a usable link, or something that is not one. */
export function mapLinkState(raw: unknown): MapLinkState {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return 'empty';
  return extractGoogleMapsLink(text) ? 'valid' : 'invalid';
}

/** Google Maps search for a place, so the company can open it and copy its link. */
export function googleMapsSearchUrl(name: string | null | undefined): string | null {
  const q = String(name ?? '').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
