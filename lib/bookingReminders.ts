import { parseStoredDateTime } from './dateTime';
import type { BookingRow } from './bookings';
import { isBookingRowUuid } from './bookings';
import { supabase } from './supabase';
import { trimUserId } from './userId';

/** Driver may confirm from 1h45 before trip until departure (matches reminder push). */
const CONFIRM_WINDOW_MS = 105 * 60 * 1000;

export function bookingStartMs(row: Pick<BookingRow, 'date_display'>): number | null {
  const parsed = parseStoredDateTime(row.date_display);
  return parsed ? parsed.getTime() : null;
}

/** Show „დაადასტურე“ from 1h45 before trip start until departure. */
export function canDriverConfirmUpcomingBooking(
  row: Pick<BookingRow, 'status' | 'date_display' | 'driver_confirmed_1h'>,
  nowMs = Date.now(),
): boolean {
  if (row.status !== 'accepted') return false;
  if (row.driver_confirmed_1h === true) return false;
  const start = bookingStartMs(row);
  if (start === null || start <= nowMs) return false;
  return start - nowMs <= CONFIRM_WINDOW_MS;
}

export function isDriverOneHourConfirmed(
  row: Pick<BookingRow, 'driver_confirmed_1h'>,
): boolean {
  return row.driver_confirmed_1h === true;
}

/** Driver taps „დაადასტურე“ on an accepted upcoming booking. */
export async function confirmDriverOneHourBooking(bookingRowId: string, driverUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const drv = trimUserId(driverUserId);
  if (!drv) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ driver_confirmed_1h: true })
    .eq('id', rowId)
    .eq('driver_id', drv)
    .eq('status', 'accepted')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error };
  if (!data) {
    return {
      ok: false as const,
      error: new Error('დადასტურება ვერ მოხერხდა — ჯავშანი სხვა მდგომარეობაშია'),
    };
  }
  return { ok: true as const, error: null };
}
