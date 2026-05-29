import type { BookingRow } from './bookings';
import { isBookingRowUuid } from './bookings';
import { supabase } from './supabase';
import { trimUserId } from './userId';

export type BookingPaymentStatus = 'unpaid' | 'paid';

export function normalizeBookingPaymentStatus(
  value: string | null | undefined,
): BookingPaymentStatus {
  return value === 'paid' ? 'paid' : 'unpaid';
}

export function isBookingPaymentPaid(booking: Pick<BookingRow, 'payment_status'>): boolean {
  return normalizeBookingPaymentStatus(booking.payment_status) === 'paid';
}

/** Driver confirms they received payment for a completed trip. */
export async function confirmDriverPaymentReceived(
  bookingRowId: string,
  driverUserId: string,
): Promise<{ ok: true; error: null } | { ok: false; error: Error }> {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false, error: new Error('invalid booking id') };
  }
  const drv = trimUserId(driverUserId);
  if (!drv) {
    return { ok: false, error: new Error('მძღოლის id არ არის') };
  }

  const confirmedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({
      payment_status: 'paid',
      payment_confirmed_at: confirmedAt,
      payment_confirmed_by: drv,
    })
    .eq('id', rowId)
    .eq('status', 'completed')
    .eq('driver_id', drv)
    .neq('payment_status', 'paid')
    .select('id')
    .maybeSingle();

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  if (!data) {
    return {
      ok: false,
      error: new Error('გადახდის დადასტურება ვერ მოხერხდა — ჯავშანი უნდა იყოს დასრულებული და გადაუხდელი'),
    };
  }
  return { ok: true, error: null };
}
