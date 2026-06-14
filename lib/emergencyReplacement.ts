import type { LocationValue } from './bookingLocations';
import { formatLocationDisplay, persistLocationFields } from './bookingLocations';
import type { BookingRow } from './bookings';
import { navigationQueryFromBookingFields } from './openExternalNavigation';

export type EmergencyBreakdownInput = {
  location: LocationValue;
  notes?: string | null;
};

export function breakdownLocationPersistFields(input: EmergencyBreakdownInput): {
  breakdown_location: string | null;
  breakdown_location_type: string | null;
} {
  const { name, type } = persistLocationFields(input.location);
  const notes = input.notes?.trim();
  const combined = [name, notes].filter(Boolean).join(' — ') || null;
  return {
    breakdown_location: combined,
    breakdown_location_type: type,
  };
}

export function formatBreakdownLocationDisplay(booking: Pick<
  BookingRow,
  'breakdown_location' | 'breakdown_location_type'
>): string | null {
  const text = booking.breakdown_location?.trim();
  if (!text) return null;
  const type = booking.breakdown_location_type?.trim() || null;
  if (type) {
    return formatLocationDisplay(text, type, { withIcon: true });
  }
  return `📍 ${text}`;
}

export function breakdownNavigationQuery(
  booking: Pick<BookingRow, 'breakdown_location' | 'breakdown_location_type'>,
): string | null {
  return navigationQueryFromBookingFields(
    booking.breakdown_location,
    booking.breakdown_location_type,
  );
}

export function bookingIsEmergencyReplacement(
  booking: Pick<BookingRow, 'is_emergency_replacement'>,
): boolean {
  return booking.is_emergency_replacement === true;
}
