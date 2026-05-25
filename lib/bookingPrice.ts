import type { BookingRow } from './bookings';

/** Amount the company offers the driver (KEKE takes no commission from this). */
export function bookingOfferedPriceGel(booking: BookingRow): number {
  const fromPrice = Number(booking.price_gel);
  if (Number.isFinite(fromPrice) && fromPrice > 0) return fromPrice;
  const fromClient = Number(booking.client_price);
  if (Number.isFinite(fromClient) && fromClient > 0) return fromClient;
  return 0;
}
