import { captureOdometerPhoto } from './bookingOdometer';
import { uploadMediaObject } from './mediaUpload';
import { supabase } from './supabase';
import { trimUserId } from './userId';

/**
 * A multi-day tour is N days of work, not one job.
 *
 * The driver closes each day as it ends — odometer, where he slept, what he
 * spent, anything worth writing down — and only when every day is closed can
 * the tour be finished with a summary. Days close in order and never before the
 * day has started; the rules live in `close_tour_day` on the server, so the app
 * cannot skip them and neither can a stale screen.
 */

export type TourDayRow = {
  dayIndex: number;
  dayDate: string | null;
  fromPlace: string | null;
  toPlace: string | null;
  stops: string | null;
  plannedOvernight: string | null;
  isClosed: boolean;
  canClose: boolean;
  closedAt: string | null;
  odometerValue: number | null;
  odometerPhotoUrl: string | null;
  overnightPlace: string | null;
  extraCostsGel: number | null;
  note: string | null;
};

export type TourDayProgress = {
  days: TourDayRow[];
  total: number;
  closed: number;
  allClosed: boolean;
  /** The first day still waiting to be closed, if any. */
  nextOpen: TourDayRow | null;
};

export type CloseTourDayInput = {
  odometerValue?: number | null;
  odometerPhotoUrl?: string | null;
  overnightPlace?: string | null;
  extraCostsGel?: number | null;
  note?: string | null;
};

export type TourCompletionSummary = {
  totalDays: number;
  closedDays: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  odometerKm: number | null;
  extraCostsGel: number;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

function rowToTourDay(row: Record<string, unknown>): TourDayRow {
  return {
    dayIndex: Number(row.day_index ?? 0),
    dayDate: str(row.day_date),
    fromPlace: str(row.from_place),
    toPlace: str(row.to_place),
    stops: str(row.stops),
    plannedOvernight: str(row.planned_overnight),
    isClosed: row.is_closed === true,
    canClose: row.can_close === true,
    closedAt: str(row.closed_at),
    odometerValue: num(row.odometer_value),
    odometerPhotoUrl: str(row.odometer_photo_url),
    overnightPlace: str(row.overnight_place),
    extraCostsGel: num(row.extra_costs_gel),
    note: str(row.note),
  };
}

export function summarizeTourDays(days: TourDayRow[]): TourDayProgress {
  const closed = days.filter((d) => d.isClosed).length;
  return {
    days,
    total: days.length,
    closed,
    allClosed: days.length > 0 && closed >= days.length,
    nextOpen: days.find((d) => !d.isClosed) ?? null,
  };
}

/** The day-by-day plan with whatever has already been logged merged in. */
export async function fetchTourDayPlan(
  bookingId: string,
): Promise<{ data: TourDayProgress | null; error: Error | null }> {
  const id = String(bookingId ?? '').trim();
  if (!id) return { data: null, error: new Error('ჯავშნის id არ არის') };

  const { data, error } = await supabase.rpc('tour_day_plan', { p_booking_id: id });
  if (error) return { data: null, error: new Error(error.message) };

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return { data: summarizeTourDays(rows.map(rowToTourDay)), error: null };
}

/** True for a booking that needs the day-by-day flow at all. */
export function isMultiDayTour(row: {
  kind?: string | null;
  tour_days?: unknown;
  itinerary?: unknown;
}): boolean {
  const kind = String(row.kind ?? '').toLowerCase();
  if (kind !== 'tour') return false;
  const days = Array.isArray(row.tour_days)
    ? row.tour_days.length
    : Array.isArray(row.itinerary)
      ? row.itinerary.length
      : 0;
  return days > 1;
}

export function tourDayPhotoPath(
  driverUserId: string,
  bookingId: string,
  dayIndex: number,
): string {
  return `odometer/${trimUserId(driverUserId)}/${String(bookingId).trim()}/day-${dayIndex}.jpg`;
}

/** Camera → storage. Returns null when the driver backs out. */
export async function captureTourDayOdometer(
  bookingId: string,
  driverUserId: string,
  dayIndex: number,
): Promise<{ ok: true; url: string } | { ok: false; cancelled: boolean; error: Error | null }> {
  const captured = await captureOdometerPhoto();
  if (!captured.ok) {
    const cancelled = 'cancelled' in captured && captured.cancelled === true;
    return {
      ok: false,
      cancelled,
      error: cancelled ? null : ('error' in captured ? captured.error : new Error('capture_failed')),
    };
  }

  try {
    const url = await uploadMediaObject(
      tourDayPhotoPath(driverUserId, bookingId, dayIndex),
      captured.uri,
      { contentType: 'image/jpeg' },
    );
    return { ok: true, url };
  } catch (e) {
    return {
      ok: false,
      cancelled: false,
      error: e instanceof Error ? e : new Error('upload_failed'),
    };
  }
}

export type CloseTourDayResult = {
  ok: boolean;
  code: string;
  message: string;
  closedDays: number;
  totalDays: number;
  allClosed: boolean;
};

export async function closeTourDay(
  bookingId: string,
  dayIndex: number,
  input: CloseTourDayInput = {},
): Promise<{ result: CloseTourDayResult | null; error: Error | null }> {
  const id = String(bookingId ?? '').trim();
  if (!id || !Number.isFinite(dayIndex) || dayIndex < 1) {
    return { result: null, error: new Error('არასწორი დღე') };
  }

  const { data, error } = await supabase.rpc('close_tour_day', {
    p_booking_id: id,
    p_day_index: Math.round(dayIndex),
    p_odometer_value: input.odometerValue ?? null,
    p_odometer_photo_url: input.odometerPhotoUrl ?? null,
    p_overnight_place: input.overnightPlace ?? null,
    p_extra_costs_gel: input.extraCostsGel ?? null,
    p_note: input.note ?? null,
  });

  if (error) return { result: null, error: new Error(error.message) };

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    result: {
      ok: row.ok === true,
      code: String(row.code ?? ''),
      message: str(row.message) ?? '',
      closedDays: Number(row.closedDays ?? 0),
      totalDays: Number(row.totalDays ?? 0),
      allClosed: row.allClosed === true,
    },
    error: null,
  };
}

export async function completeTourBooking(
  bookingId: string,
): Promise<
  | { ok: true; summary: TourCompletionSummary; error: null }
  | { ok: false; summary: null; error: Error }
> {
  const id = String(bookingId ?? '').trim();
  if (!id) return { ok: false, summary: null, error: new Error('ჯავშნის id არ არის') };

  const { data, error } = await supabase.rpc('complete_tour_booking_as_driver', {
    p_booking_id: id,
  });
  if (error) return { ok: false, summary: null, error: new Error(error.message) };

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return {
      ok: false,
      summary: null,
      error: new Error(str(row.message) ?? 'ტურის დასრულება ვერ მოხერხდა'),
    };
  }

  return {
    ok: true,
    error: null,
    summary: {
      totalDays: Number(row.totalDays ?? 0),
      closedDays: Number(row.closedDays ?? 0),
      odometerStart: num(row.odometerStart),
      odometerEnd: num(row.odometerEnd),
      odometerKm: num(row.odometerKm),
      extraCostsGel: num(row.extraCostsGel) ?? 0,
    },
  };
}

/** The generic completion path raises this when days are still open. */
export function isTourDaysOpenError(message: string | null | undefined): boolean {
  return String(message ?? '').includes('TOUR_DAYS_OPEN');
}

export function tourDaysOpenMessage(message: string | null | undefined): string {
  const raw = String(message ?? '').trim();
  const idx = raw.indexOf('TOUR_DAYS_OPEN');
  if (idx < 0) return raw;
  return raw.slice(idx + 'TOUR_DAYS_OPEN'.length).replace(/^[:\s]+/, '').trim()
    || 'ჯერ ყველა დღე დახურე';
}
