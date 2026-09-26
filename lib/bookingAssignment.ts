import { formatDisplayDateTime } from './dateTime';
import { supabase } from './supabase';
import { trimUserId } from './userId';

/**
 * Assignment goes through `accept_booking_atomic` on the server so that the
 * busy-time block and the booking update happen inside ONE transaction. The
 * `driver_schedules` EXCLUDE constraint then makes a double booking
 * impossible — a driver (or a vehicle) can never end up in two overlapping
 * jobs, no matter which screen or race condition got there first.
 */
export type AcceptBookingCode =
  | 'accepted'
  | 'already_yours'
  | 'bad_input'
  | 'not_found'
  | 'forbidden'
  | 'not_pending'
  | 'taken'
  | 'no_window'
  | 'driver_busy'
  | 'vehicle_busy';

export type AcceptBookingResult = {
  ok: boolean;
  code: AcceptBookingCode;
  message: string;
  conflictBookingId: string | null;
  conflictStart: string | null;
  conflictEnd: string | null;
  windowStart: string | null;
  windowEnd: string | null;
};

const FALLBACK_MESSAGE = 'ჯავშნის აღება ვერ მოხერხდა';

function asString(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

function normalizeResult(raw: unknown): AcceptBookingResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    code: (asString(row.code) as AcceptBookingCode) ?? 'bad_input',
    message: asString(row.message) ?? FALLBACK_MESSAGE,
    conflictBookingId: asString(row.conflictBookingId),
    conflictStart: asString(row.conflictStart),
    conflictEnd: asString(row.conflictEnd),
    windowStart: asString(row.windowStart),
    windowEnd: asString(row.windowEnd),
  };
}

export function isScheduleConflict(result: AcceptBookingResult): boolean {
  return result.code === 'driver_busy' || result.code === 'vehicle_busy';
}

/** " (18.09.2026, 15:24 — 18.09.2026, 17:24)" or "" when the range is unknown. */
export function formatConflictRange(result: AcceptBookingResult): string {
  const start = result.conflictStart ? new Date(result.conflictStart) : null;
  const end = result.conflictEnd ? new Date(result.conflictEnd) : null;
  if (!start || Number.isNaN(start.getTime())) return '';

  const fmt = (d: Date) => formatDisplayDateTime(d);
  if (end && !Number.isNaN(end.getTime())) {
    return `\n\n${fmt(start)} — ${fmt(end)}`;
  }
  return `\n\n${fmt(start)}`;
}

export async function acceptBookingAtomic(params: {
  bookingId: string;
  driverId: string;
  vehicleId?: string | null;
  displayName?: string | null;
  phone?: string | null;
  plate?: string | null;
}): Promise<{ result: AcceptBookingResult | null; error: Error | null }> {
  const bookingId = String(params.bookingId ?? '').trim();
  const driverId = trimUserId(params.driverId);
  if (!bookingId || !driverId) {
    return { result: null, error: new Error('ჯავშნის ან მძღოლის id არ არის') };
  }

  const { data, error } = await supabase.rpc('accept_booking_atomic', {
    p_booking_id: bookingId,
    p_driver_id: driverId,
    p_vehicle_id: params.vehicleId?.trim() || null,
    p_display_name: params.displayName?.trim() || null,
    p_phone: params.phone?.trim() || null,
    p_plate: params.plate?.trim() || null,
  });

  if (error) return { result: null, error: new Error(error.message) };
  return { result: normalizeResult(data), error: null };
}

/** Driver taps „დაადასტურე" on any reminder stage (3h / 1h / 45m). */
export async function confirmBookingAsDriver(
  bookingId: string,
): Promise<{ ok: boolean; message: string; error: Error | null }> {
  const id = String(bookingId ?? '').trim();
  if (!id) return { ok: false, message: 'ჯავშნის id არ არის', error: new Error('missing id') };

  const { data, error } = await supabase.rpc('confirm_booking_as_driver', {
    p_booking_id: id,
  });
  if (error) return { ok: false, message: error.message, error: new Error(error.message) };

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    message: asString(row.message) ?? '',
    error: null,
  };
}

export type BookingBusyWindow = { start: string; end: string };

/** Server-computed busy window for a booking (same maths the guard uses). */
export async function fetchBookingBusyWindow(
  bookingId: string,
): Promise<BookingBusyWindow | null> {
  const id = String(bookingId ?? '').trim();
  if (!id) return null;

  const { data, error } = await supabase.rpc('booking_busy_window', {
    p_booking_id: id,
  });
  if (error || !data) return null;

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  const start = asString(row?.win_start);
  const end = asString(row?.win_end);
  if (!start || !end) return null;
  return { start, end };
}
