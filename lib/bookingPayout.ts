import type { BookingRow } from './bookings';
import { trimUserId } from './userId';

export function parseDriverPayoutInput(
  raw: string,
  maxGel: number,
): { ok: true; value: number } | { ok: false; error: 'empty' | 'invalid' | 'over_max' } {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return { ok: false, error: 'empty' };
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'invalid' };
  const max = Number(maxGel);
  if (Number.isFinite(max) && max > 0 && value > max) return { ok: false, error: 'over_max' };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Sub on a host-delegated booking (viewer is assigned driver, not host). */
export function isFleetSubDriverBooking(
  booking: Pick<BookingRow, 'host_driver_id' | 'driver_id'>,
  viewerUserId: string,
): boolean {
  const viewer = trimUserId(viewerUserId);
  const host = trimUserId(booking.host_driver_id ?? '');
  const driver = trimUserId(booking.driver_id ?? '');
  if (!viewer || !host || !driver) return false;
  return driver === viewer && host !== viewer;
}

export function isFleetHostBooking(
  booking: Pick<BookingRow, 'host_driver_id'>,
  viewerUserId: string,
): boolean {
  const viewer = trimUserId(viewerUserId);
  const host = trimUserId(booking.host_driver_id ?? '');
  return !!viewer && !!host && host === viewer;
}

export function hasDriverPayoutSnapshot(
  booking: Pick<BookingRow, 'driver_payout_gel'>,
): boolean {
  const v = booking.driver_payout_gel;
  return v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
}

/** Earnings / pay line for the assigned driver. */
export function driverPayableGel(booking: Pick<BookingRow, 'price_gel' | 'driver_payout_gel'>): number {
  if (hasDriverPayoutSnapshot(booking)) {
    return Number(booking.driver_payout_gel);
  }
  return Number(booking.price_gel || 0);
}

/** Host keeps after paying sub (fleet delegation only). */
export function hostNetGel(
  booking: Pick<BookingRow, 'price_gel' | 'driver_payout_gel'>,
): number {
  const total = Number(booking.price_gel || 0);
  if (!hasDriverPayoutSnapshot(booking)) return total;
  return Math.max(0, Math.round((total - Number(booking.driver_payout_gel)) * 100) / 100);
}

/** Completed-trip earnings for driver stats. */
export function completedDriverEarningsGel(
  booking: Pick<BookingRow, 'price_gel' | 'driver_payout_gel' | 'host_driver_id' | 'driver_id'>,
  driverUserId: string,
): number {
  // A payout snapshot always wins for the assigned driver: it is what the
  // booking screen shows them, so stats must agree. Today snapshots are only
  // written on fleet delegation, but keying off the snapshot (rather than the
  // fleet relationship) keeps stats correct if a non-fleet payout path is
  // added later.
  const viewer = trimUserId(driverUserId);
  const assigned = trimUserId(booking.driver_id ?? '');
  if (viewer && assigned === viewer && hasDriverPayoutSnapshot(booking)) {
    return driverPayableGel(booking);
  }
  return Number(booking.price_gel || 0);
}
