import type { BookingRow } from './bookings';

export function bookingIsEmergencyReplacement(
  booking: Pick<BookingRow, 'is_emergency_replacement'>,
): boolean {
  return booking.is_emergency_replacement === true;
}
