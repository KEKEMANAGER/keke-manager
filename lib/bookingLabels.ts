/**
 * Localized booking kind labels (`booking.type.*` in locale JSON).
 * DB / API codes: transfer | tour | day_tour (+ transfer_arrival | transfer_departure when stored).
 */
import en from '../src/locales/en.json';
import ka from '../src/locales/ka.json';
import ru from '../src/locales/ru.json';
import i18n from '../src/lib/i18n';

export type BookingKindLabelCode =
  | 'transfer'
  | 'transfer_arrival'
  | 'transfer_departure'
  | 'tour'
  | 'day_tour';

type BookingLocales = typeof ka;

const FALLBACK_EN: Record<BookingKindLabelCode, string> = {
  transfer: 'Transfer',
  transfer_arrival: 'Transfer — arrival',
  transfer_departure: 'Transfer — departure',
  tour: 'Tour',
  day_tour: 'Day Tour',
};

function bookingBundle(lang: string): BookingLocales['booking'] {
  const code = lang.split('-')[0]?.toLowerCase() ?? 'ka';
  if (code === 'ru') return ru.booking;
  if (code === 'en') return en.booking;
  return ka.booking;
}

function currentLangCode(): string {
  return String(i18n.resolvedLanguage || i18n.language || 'ka');
}

/** Resolve any stored `kind` / `booking_type` (+ optional transfer tab) to a locale key. */
export function resolveBookingKindLabelCode(
  raw: string | null | undefined,
  flightDirection?: string | null,
): BookingKindLabelCode {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (k === 'transfer_arrival' || k === 'transfer-arrival') return 'transfer_arrival';
  if (k === 'transfer_departure' || k === 'transfer-departure') return 'transfer_departure';
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour') return 'day_tour';

  const dir = String(flightDirection ?? '')
    .trim()
    .toLowerCase();
  if (k === 'transfer' || k === '' || k === 'transfer_arrival' || k === 'transfer_departure') {
    if (dir === 'arrival') return 'transfer_arrival';
    if (dir === 'departure') return 'transfer_departure';
    if (k === 'transfer_arrival') return 'transfer_arrival';
    if (k === 'transfer_departure') return 'transfer_departure';
    return 'transfer';
  }

  if (k.includes('day') && k.includes('tour')) return 'day_tour';
  if (k.includes('tour')) return 'tour';
  if (k.includes('transfer')) return 'transfer';

  return 'transfer';
}

/** Localized label for cards, history, vouchers, and previews. */
export function bookingKindLabel(
  kind: string | null | undefined,
  flightDirection?: string | null,
): string {
  const code = resolveBookingKindLabelCode(kind, flightDirection);
  const row = bookingBundle(currentLangCode()).type as Record<string, string>;
  const fromLocale = row[code]?.trim();
  if (fromLocale) return fromLocale;
  return FALLBACK_EN[code] ?? code;
}

/** @deprecated Use `bookingKindLabel`. Kept for existing imports. */
export function bookingTypeLabel(type: string, flightDirection?: string | null): string {
  return bookingKindLabel(type, flightDirection);
}
