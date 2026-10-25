import { Linking, Platform } from 'react-native';
import type { TourDayPersisted } from './bookings';
import { formatLocationDisplay } from './bookingLocations';
import { tourEndpointsFromDays } from './tourDays';

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

/** Today's stops on a multi-day tour, by the phone's own date; none on other days. */
export function todaysTourStops(
  days: TourDayPersisted[] | null | undefined,
  now: Date = new Date(),
): string[] {
  if (!Array.isArray(days) || days.length === 0) return [];
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  const today = `${now.getFullYear()}-${m}-${d}`;
  const day = days.find((x) => String(x?.date ?? '').slice(0, 10) === today);
  return day ? splitTourStops(day.stops) : [];
}

export type TripNavigationTargets = {
  pickup: string | null;
  destination: string | null;
};

export type TripNavBooking = {
  from_location?: string | null;
  from_location_type?: string | null;
  to_location?: string | null;
  to_location_type?: string | null;
  transfer_in?: {
    airport?: string;
    airport_type?: string | null;
    hotel?: string;
    hotel_type?: string | null;
  } | null;
  transfer_out?: {
    airport?: string;
    airport_type?: string | null;
    hotel?: string;
    hotel_type?: string | null;
  } | null;
  tour_days?: TourDayPersisted[] | null;
};

/** Resolve pickup / destination text for Maps (transfer, tour legs, or plain from/to). */
export function tripNavigationTargets(booking: TripNavBooking): TripNavigationTargets {
  let pickup = navigationQueryFromBookingFields(booking.from_location, booking.from_location_type);
  let destination = navigationQueryFromBookingFields(booking.to_location, booking.to_location_type);

  const tin = booking.transfer_in;
  if (!pickup && tin?.airport?.trim()) {
    pickup = navigationQueryFromBookingFields(tin.airport, tin.airport_type);
  }
  if (!destination && tin?.hotel?.trim()) {
    destination = navigationQueryFromBookingFields(tin.hotel, tin.hotel_type);
  }

  const tout = booking.transfer_out;
  if (!pickup && tout?.hotel?.trim()) {
    pickup = navigationQueryFromBookingFields(tout.hotel, tout.hotel_type);
  }
  if (!destination && tout?.airport?.trim()) {
    destination = navigationQueryFromBookingFields(tout.airport, tout.airport_type);
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

  return { pickup, destination };
}

export function hasTripNavigationTargets(booking: TripNavBooking): boolean {
  const { pickup, destination } = tripNavigationTargets(booking);
  return Boolean(pickup || destination);
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
