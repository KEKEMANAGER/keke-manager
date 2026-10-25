import { Linking, Platform } from 'react-native';
import type { TourDayPersisted } from './bookings';
import { formatLocationDisplay } from './bookingLocations';
import { extractGoogleMapsLink, locationTypeTakesMapLink } from './googleMapsLink';
import { readTourDayHotel, readTourDayHotelLink, tourEndpointsFromDays } from './tourDays';

/** Maps search query — append Georgia when missing for better geocoding. */
export function navigationQueryFromLocation(name: string | null | undefined): string | null {
  const n = name?.trim();
  if (!n) return null;
  if (/georgia|საქართველ/i.test(n)) return n;
  return `${n}, Georgia`;
}

export function navigationQueryFromBookingFields(
  name: string | null | undefined,
  type: string | null | undefined,
): string | null {
  const label = formatLocationDisplay(name, type, { withIcon: false });
  if (!label || label === '—') return null;
  return navigationQueryFromLocation(label);
}

/**
 * A tour day's stops as separate places. Companies type them as one line —
 * "სამების ტაძარი - მეტეხის ხიდი - დაშბაშის კანიონი" — or send them as a list.
 * Only a dash with spaces around it separates, so a hyphenated name stays whole.
 */
export function splitTourStops(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map((p) => String(p ?? ''))
    : String(raw ?? '').split(/\s+[-–—]\s+|\s*[,;|→\n]\s*/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const name = part
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[-–—•·.\s]+|[-–—•·.\s]+$/g, '');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** A place the driver can tap: its name, and its exact Google Maps link when the company gave one. */
export type NavPlace = {
  name: string;
  link?: string | null;
};

type TransferLegNav = {
  date?: string | null;
  airport?: string;
  airport_type?: string | null;
  airport_link?: string | null;
  hotel?: string;
  hotel_type?: string | null;
  hotel_link?: string | null;
};

export type TripNavigationTargets = {
  pickup: string | null;
  destination: string | null;
  /** The pickup's own Google Maps link, when the company pasted one. */
  pickupLink?: string | null;
  /** The destination's own Google Maps link, when the company pasted one. */
  destinationLink?: string | null;
};

export type TripNavBooking = {
  from_location?: string | null;
  from_location_type?: string | null;
  from_location_link?: string | null;
  to_location?: string | null;
  to_location_type?: string | null;
  to_location_link?: string | null;
  transfer_in?: TransferLegNav | null;
  transfer_out?: TransferLegNav | null;
  tour_days?: TourDayPersisted[] | null;
};

function localDayKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function hotelPlace(name: string | null | undefined, link: string | null | undefined): NavPlace | null {
  const n = String(name ?? '').trim();
  const l = extractGoogleMapsLink(link);
  if (!n && !l) return null;
  return { name: n, link: l };
}

export type TourDayNavigation = {
  /** Where today starts: the hotel the tourists slept in last night. */
  dayStart: NavPlace | null;
  stops: string[];
  /** Where today ends: the hotel the tourists sleep in tonight. */
  dayEnd: NavPlace | null;
};

/**
 * Today's day of a multi-day tour, by the phone's own date: where it starts,
 * its stops, and where it ends. Nothing on a day outside the tour.
 *
 * A tour that does not come back to Tbilisi ends each evening at another
 * hotel, and the next morning starts there. The voucher lists every hotel; on
 * the road the driver needs tonight's, and tomorrow last night's.
 */
export function tourDayNavigation(
  booking: Pick<TripNavBooking, 'tour_days' | 'transfer_in'>,
  now: Date = new Date(),
): TourDayNavigation {
  const days = Array.isArray(booking.tour_days) ? booking.tour_days : [];
  const today = localDayKey(now);
  const idx = days.findIndex((x) => String(x?.date ?? '').slice(0, 10) === today);
  if (idx < 0) return { dayStart: null, stops: [], dayEnd: null };

  const day = days[idx];
  let dayStart: NavPlace | null = null;
  if (idx > 0) {
    const prev = days[idx - 1];
    dayStart = hotelPlace(readTourDayHotel(prev), readTourDayHotelLink(prev));
  } else {
    // Landed the day before: the first morning starts at the arrival hotel.
    const tin = booking.transfer_in;
    const landed = tin?.date ? new Date(tin.date) : null;
    const isStay = !tin?.hotel_type || locationTypeTakesMapLink(tin.hotel_type);
    if (tin && isStay && landed && !Number.isNaN(landed.getTime()) && localDayKey(landed) < today) {
      dayStart = hotelPlace(tin.hotel, tin.hotel_link);
    }
  }
  // The last day has no hotel: the tour ends there, or at the airport.
  const isLast = idx === days.length - 1;
  const dayEnd = isLast ? null : hotelPlace(readTourDayHotel(day), readTourDayHotelLink(day));
  return { dayStart, stops: splitTourStops(day.stops), dayEnd };
}

/** Today's stops on a multi-day tour, by the phone's own date; none on other days. */
export function todaysTourStops(
  days: TourDayPersisted[] | null | undefined,
  now: Date = new Date(),
): string[] {
  return tourDayNavigation({ tour_days: days ?? null }, now).stops;
}

/** Resolve pickup / destination text for Maps (transfer, tour legs, or plain from/to). */
export function tripNavigationTargets(booking: TripNavBooking): TripNavigationTargets {
  let pickup = navigationQueryFromBookingFields(booking.from_location, booking.from_location_type);
  let pickupLink = pickup ? extractGoogleMapsLink(booking.from_location_link) : null;
  let destination = navigationQueryFromBookingFields(booking.to_location, booking.to_location_type);
  let destinationLink = destination ? extractGoogleMapsLink(booking.to_location_link) : null;

  const tin = booking.transfer_in;
  if (!pickup && tin?.airport?.trim()) {
    pickup = navigationQueryFromBookingFields(tin.airport, tin.airport_type);
    pickupLink = extractGoogleMapsLink(tin.airport_link);
  }
  if (!destination && tin?.hotel?.trim()) {
    destination = navigationQueryFromBookingFields(tin.hotel, tin.hotel_type);
    destinationLink = extractGoogleMapsLink(tin.hotel_link);
  }

  const tout = booking.transfer_out;
  if (!pickup && tout?.hotel?.trim()) {
    pickup = navigationQueryFromBookingFields(tout.hotel, tout.hotel_type);
    pickupLink = extractGoogleMapsLink(tout.hotel_link);
  }
  if (!destination && tout?.airport?.trim()) {
    destination = navigationQueryFromBookingFields(tout.airport, tout.airport_type);
    destinationLink = extractGoogleMapsLink(tout.airport_link);
  }

  if ((!pickup || !destination) && booking.tour_days?.length) {
    const endpoints = tourEndpointsFromDays(booking.tour_days);
    if (!pickup && endpoints.from) {
      pickup = navigationQueryFromLocation(endpoints.from);
    }
    if (!destination && endpoints.to) {
      destination = navigationQueryFromLocation(endpoints.to);
    }
  }

  return { pickup, destination, pickupLink, destinationLink };
}

export function hasTripNavigationTargets(booking: TripNavBooking): boolean {
  const { pickup, destination } = tripNavigationTargets(booking);
  return Boolean(pickup || destination);
}

/**
 * Takes the driver to a place: to its own Google Maps link when the company
 * pasted one, otherwise to a search for its name, as before.
 *
 * The link opens the place itself — its name, photo and pin — so the driver
 * sees it is the right hotel before he taps Start. A search by name can land
 * on a namesake in another town.
 */
export async function openPlaceNavigation(
  query: string | null | undefined,
  link?: string | null,
): Promise<boolean> {
  const mapLink = extractGoogleMapsLink(link);
  if (mapLink) {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.open(mapLink, '_blank', 'noopener');
      }
      return true;
    }
    try {
      await Linking.openURL(mapLink);
      return true;
    } catch {
      /* nothing took the link: search by name instead */
    }
  }
  const q = query?.trim();
  if (!q) return false;
  return openExternalNavigation(q);
}

/** Opens Google Maps / Apple Maps for driving directions (no API key). */
export async function openExternalNavigation(destination: string): Promise<boolean> {
  const trimmed = destination.trim();
  if (!trimmed) return false;

  const q = encodeURIComponent(trimmed);

  // In a browser there are no app schemes to try (react-native-web answers
  // "yes" to every one and would open a dead page), so Google Maps on the web.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
        '_blank',
        'noopener',
      );
    }
    return true;
  }

  const urls =
    Platform.OS === 'ios'
      ? [
          `comgooglemaps://?daddr=${q}&directionsmode=driving`,
          `maps://?daddr=${q}&dirflg=d`,
          `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
        ]
      : [
          `google.navigation:q=${q}&mode=d`,
          `geo:0,0?q=${q}`,
          `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
        ];

  for (const url of urls) {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      /* try next scheme */
    }
  }

  await Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
  );
  return true;
}
