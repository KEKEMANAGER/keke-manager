import { parseStoredDateTime, toIsoString } from './dateTime';

type ItineraryDay = { day: number; from: string; to: string; stops: string };
type TourTransferLeg = { date: string; flight: string; passengerName: string };

function normalizeScheduleKind(kind: string): 'transfer' | 'tour' | 'day_tour' {
  const k = String(kind).trim().toLowerCase();
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour' || k === 'day tour') return 'day_tour';
  return 'transfer';
}
import { supabase } from './supabase';

/** Padding around busy blocks when checking if a new booking overlaps. */
export const SCHEDULE_OVERLAP_BUFFER_MS = 30 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const TRANSFER_DURATION_MS = 2 * HOUR_MS;
const DAY_TOUR_DURATION_MS = 8 * HOUR_MS;
const TOUR_DAY_DURATION_MS = 8 * HOUR_MS;

export type DriverScheduleRow = {
  id: string;
  driver_id: string;
  booking_id: string | null;
  start_time: string;
  end_time: string;
  source: 'manual' | 'booking';
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type BusyTimeWindow = {
  start: Date;
  end: Date;
};

export type BookingScheduleInput = {
  kind: string;
  date_display?: string | null;
  itinerary?: ItineraryDay[] | null;
  transfer_in?: TourTransferLeg | null;
  transfer_out?: TourTransferLeg | null;
};

/** True when intervals intersect (optional buffer expands both sides). */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  bufferMs = 0,
): boolean {
  const a0 = aStart.getTime() - bufferMs;
  const a1 = aEnd.getTime() + bufferMs;
  const b0 = bStart.getTime() - bufferMs;
  const b1 = bEnd.getTime() + bufferMs;
  return a0 < b1 && a1 > b0;
}

/**
 * Estimated busy window for a booking (hourly blocks, not full calendar days).
 * Returns null when service time cannot be parsed — callers should fail open.
 */
export function estimateBookingBusyWindow(input: BookingScheduleInput): BusyTimeWindow | null {
  const kind = normalizeScheduleKind(input.kind);
  const primary = parseStoredDateTime(input.date_display);
  const transferInStart = parseStoredDateTime(input.transfer_in?.date ?? null);
  const transferOutStart = parseStoredDateTime(input.transfer_out?.date ?? null);

  if (kind === 'transfer') {
    const start = primary ?? new Date();
    return { start, end: new Date(start.getTime() + TRANSFER_DURATION_MS) };
  }

  if (kind === 'day_tour') {
    const start = primary ?? new Date();
    return { start, end: new Date(start.getTime() + DAY_TOUR_DURATION_MS) };
  }

  // Multi-day tour: from transfer-in (or primary date) through last day + 8h
  const start = transferInStart ?? primary ?? new Date();
  let end = new Date(start.getTime() + TOUR_DAY_DURATION_MS);

  if (transferOutStart && transferOutStart.getTime() > start.getTime()) {
    end = new Date(transferOutStart.getTime() + TOUR_DAY_DURATION_MS);
  } else if (input.itinerary?.length) {
    const days = Math.max(1, input.itinerary.length);
    end = new Date(start.getTime() + days * TOUR_DAY_DURATION_MS);
  } else if (primary && primary.getTime() > start.getTime()) {
    end = new Date(primary.getTime() + TOUR_DAY_DURATION_MS);
  }

  return { start, end };
}

export async function fetchDriverSchedules(
  driverId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ data: DriverScheduleRow[]; error: Error | null }> {
  const id = driverId.trim();
  if (!id) return { data: [], error: new Error('driver id არ არის') };

  const { data, error } = await supabase
    .from('driver_schedules')
    .select('*')
    .eq('driver_id', id)
    .lt('start_time', toIsoString(rangeEnd))
    .gt('end_time', toIsoString(rangeStart))
    .order('start_time', { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as DriverScheduleRow[], error: null };
}

export async function fetchOverlappingSchedulesForDrivers(
  driverIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<{ data: DriverScheduleRow[]; error: Error | null }> {
  const ids = [...new Set(driverIds.map((d) => d.trim()).filter(Boolean))];
  if (!ids.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('driver_schedules')
    .select('id, driver_id, booking_id, start_time, end_time, source, label')
    .in('driver_id', ids)
    .lt('start_time', toIsoString(rangeEnd))
    .gt('end_time', toIsoString(rangeStart));

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as DriverScheduleRow[], error: null };
}

/** Drivers with no schedule overlap (plus buffer) for the proposed booking window. */
export async function filterDriverIdsAvailableForWindow(
  driverIds: string[],
  window: BusyTimeWindow,
  bufferMs = SCHEDULE_OVERLAP_BUFFER_MS,
): Promise<{ availableIds: string[]; error: Error | null }> {
  const ids = [...new Set(driverIds.map((d) => d.trim()).filter(Boolean))];
  if (!ids.length) return { availableIds: [], error: null };

  const { data: blocks, error } = await fetchOverlappingSchedulesForDrivers(
    ids,
    window.start,
    window.end,
  );
  if (error) return { availableIds: [], error };

  const busyDriverIds = new Set<string>();
  for (const block of blocks) {
    const bStart = parseStoredDateTime(block.start_time);
    const bEnd = parseStoredDateTime(block.end_time);
    if (!bStart || !bEnd) continue;
    if (intervalsOverlap(window.start, window.end, bStart, bEnd, bufferMs)) {
      busyDriverIds.add(block.driver_id);
    }
  }

  return {
    availableIds: ids.filter((id) => !busyDriverIds.has(id)),
    error: null,
  };
}

export async function createBookingScheduleBlock(
  driverId: string,
  bookingId: string,
  window: BusyTimeWindow,
): Promise<{ ok: boolean; error: Error | null }> {
  const drv = driverId.trim();
  const bid = bookingId.trim();
  if (!drv || !bid) {
    return { ok: false, error: new Error('driver ან booking id არ არის') };
  }
  if (window.end.getTime() <= window.start.getTime()) {
    return { ok: false, error: new Error('დროის დიაპაზონი არასწორია') };
  }

  const now = toIsoString(new Date());
  const { error } = await supabase.from('driver_schedules').insert({
    driver_id: drv,
    booking_id: bid,
    start_time: toIsoString(window.start),
    end_time: toIsoString(window.end),
    source: 'booking',
    label: null,
    updated_at: now,
  });

  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

/** Early release: shorten booking block to now when trip completes early. */
export async function releaseDriverScheduleForBooking(bookingId: string): Promise<void> {
  const bid = bookingId.trim();
  if (!bid) return;

  const now = toIsoString(new Date());
  await supabase
    .from('driver_schedules')
    .update({ end_time: now, updated_at: now })
    .eq('booking_id', bid)
    .eq('source', 'booking')
    .gt('end_time', now);
}

export async function createManualDriverSchedule(
  driverId: string,
  window: BusyTimeWindow,
  label?: string | null,
): Promise<{ ok: boolean; error: Error | null }> {
  const drv = driverId.trim();
  if (!drv) return { ok: false, error: new Error('driver id არ არის') };
  if (window.end.getTime() <= window.start.getTime()) {
    return { ok: false, error: new Error('დასრულების დრო უნდა იყოს დაწყების შემდეგ') };
  }

  const now = toIsoString(new Date());
  const { error } = await supabase.from('driver_schedules').insert({
    driver_id: drv,
    booking_id: null,
    start_time: toIsoString(window.start),
    end_time: toIsoString(window.end),
    source: 'manual',
    label: label?.trim() || 'დაკავებული',
    updated_at: now,
  });

  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

export async function deleteManualDriverSchedule(
  scheduleId: string,
  driverId: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const { error } = await supabase
    .from('driver_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('driver_id', driverId.trim())
    .eq('source', 'manual');

  if (error) return { ok: false, error: new Error(error.message) };
  return { ok: true, error: null };
}

export async function createScheduleForAcceptedBooking(
  bookingId: string,
  driverId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, kind, booking_type, date_display, itinerary, transfer_in, transfer_out')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !data) {
    if (__DEV__) console.warn('[driverSchedules] booking load failed', error?.message);
    return;
  }

  const row = data as Record<string, unknown>;
  const kind = String(row.kind ?? row.booking_type ?? 'transfer');
  const window =
    estimateBookingBusyWindow({
      kind,
      date_display: row.date_display as string | null,
      itinerary: row.itinerary as ItineraryDay[] | null,
      transfer_in: row.transfer_in as TourTransferLeg | null,
      transfer_out: row.transfer_out as TourTransferLeg | null,
    }) ?? {
      start: new Date(),
      end: new Date(Date.now() + DAY_TOUR_DURATION_MS),
    };

  const res = await createBookingScheduleBlock(driverId, bookingId, window);
  if (!res.ok && __DEV__) {
    console.warn('[driverSchedules] create block failed', res.error?.message);
  }
}
