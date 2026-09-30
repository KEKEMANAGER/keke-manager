import { parseStoredDateTime } from './dateTime';
import type { BookingRow } from './bookings';
import { isBookingRowUuid } from './bookings';
import { confirmBookingAsDriver } from './bookingAssignment';
import { trimUserId } from './userId';

/**
 * Reminder ladder (server side: `public.run_booking_reminders`, every minute):
 *
 *   12h  — heads-up, no action needed
 *    3h  — "can you do it? please confirm"   ← confirmation opens here
 *    1h  — urgent re-ask if still unconfirmed
 *   45m  — final warning, then the booking moves to the next driver
 *
 * The 3h ask is what actually protects the company: unanswered for 40 minutes,
 * the booking is reassigned automatically, which leaves over two hours to find
 * and brief a replacement instead of 45 minutes.
 */
export const CONFIRM_STAGE_MINUTES = [180, 60, 45] as const;

/**
 * How close to departure the reminder ladder starts nagging. Confirmation
 * itself is *not* limited to this window — see `canDriverConfirmUpcomingBooking`.
 */
const CONFIRM_WINDOW_MS = 195 * 60 * 1000;

export function bookingStartMs(row: Pick<BookingRow, 'date_display'>): number | null {
  const parsed = parseStoredDateTime(row.date_display);
  return parsed ? parsed.getTime() : null;
}

/**
 * Show „დაადასტურე" for any accepted booking that has not been confirmed yet.
 *
 * Accepting and confirming are two different promises: accepting says "I want
 * this job", confirming says "I will be there". The company needs the second
 * one the moment the driver takes the job, not three hours before departure —
 * a tour booked a month out has to show as confirmed for a month, otherwise the
 * company is holding an unanswered booking and does not know it.
 *
 * `confirm_booking_as_driver` has never had a time limit, so this only opens
 * the button the server was already willing to honour.
 */
export function canDriverConfirmUpcomingBooking(
  row: Pick<BookingRow, 'status' | 'date_display' | 'driver_confirmed_1h'>,
  _nowMs = Date.now(),
): boolean {
  if (row.status !== 'accepted') return false;
  return row.driver_confirmed_1h !== true;
}

export function isDriverConfirmed(row: Pick<BookingRow, 'driver_confirmed_1h'>): boolean {
  return row.driver_confirmed_1h === true;
}

/** @deprecated older call sites — use `isDriverConfirmed`. */
export function isDriverOneHourConfirmed(
  row: Pick<BookingRow, 'driver_confirmed_1h'>,
): boolean {
  return isDriverConfirmed(row);
}

/**
 * How urgent the outstanding confirmation is, for badge colour and copy.
 * `null` when there is nothing to confirm.
 */
export function confirmUrgency(
  row: Pick<BookingRow, 'status' | 'date_display' | 'driver_confirmed_1h'>,
  nowMs = Date.now(),
): 'final' | 'urgent' | 'due' | null {
  if (!canDriverConfirmUpcomingBooking(row, nowMs)) return null;
  const start = bookingStartMs(row);
  if (start === null || start <= nowMs) return null;
  // Urgency is still the reminder ladder's business: a booking a month out is
  // unconfirmed, not late.
  if (start - nowMs > CONFIRM_WINDOW_MS) return null;
  const minutes = (start - nowMs) / 60000;
  if (minutes <= 50) return 'final';
  if (minutes <= 75) return 'urgent';
  return 'due';
}

/**
 * Driver taps „დაადასტურე".
 *
 * Goes through `confirm_booking_as_driver` so the confirmation, its timestamp
 * and the notification to the company all happen in one server-side place —
 * and so the driver's confirmation rate, which feeds the dispatch score, has a
 * single source of truth.
 */
export async function confirmDriverBooking(bookingRowId: string, driverUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  if (!trimUserId(driverUserId)) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const res = await confirmBookingAsDriver(rowId);
  if (res.error) return { ok: false as const, error: res.error };
  if (!res.ok) {
    return {
      ok: false as const,
      error: new Error(
        res.message || 'დადასტურება ვერ მოხერხდა — ჯავშანი სხვა მდგომარეობაშია',
      ),
    };
  }
  return { ok: true as const, error: null };
}

/** @deprecated older call sites — use `confirmDriverBooking`. */
export async function confirmDriverOneHourBooking(
  bookingRowId: string,
  driverUserId: string,
) {
  return confirmDriverBooking(bookingRowId, driverUserId);
}
