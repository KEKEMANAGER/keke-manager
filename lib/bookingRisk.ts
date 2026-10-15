/**
 * "Is this booking actually going to happen?"
 *
 * A company's worst hour is the one where the tourists are standing outside the
 * hotel and the driver is not. By then nothing can be fixed. Everything needed
 * to see it coming, though, is already in the database — it has simply never
 * been put in front of the company:
 *
 *   • the driver was asked to confirm an hour before departure and said nothing
 *   • the pickup time has passed and the trip was never started
 *   • his previous job ends twenty minutes before this one begins
 *   • his phone stopped reporting a position hours ago
 *   • his record: how often he answers when assigned, how often he finishes
 *
 * This module turns those into one honest sentence on the booking card, early
 * enough to pick up the phone. It is deliberately read-only: it changes no
 * booking, sends no notification and reassigns nobody. A warning that acts on
 * its own would be a far bigger thing than a warning that is merely right.
 *
 * Two rules keep it trustworthy, because a badge that cries wolf is worse than
 * no badge at all:
 *
 *   1. A driver's history NEVER raises an alarm on its own. A weak confirmation
 *      rate explains a warning; it does not create one. Something must actually
 *      be happening to this booking first.
 *   2. A signal we cannot read is not a bad signal. A driver who has never
 *      shared a location is silent, not suspicious — only a position that was
 *      shared and then went stale counts.
 */

import { bookingStartMs } from './bookingReminders';
import type { BookingRow } from './bookings';
import { fetchDriverRankScores, type DriverRankScore } from './driverRatingSort';
import { fetchOverlappingSchedulesForDrivers } from './driverSchedules';
import { supabase } from './supabase';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Further out than this, nothing has happened yet and there is nothing to judge. */
const HORIZON_MS = 7 * 24 * HOUR_MS;

/** Past this far beyond pickup it is history, not a risk worth flagging. */
const STALE_MS = 12 * HOUR_MS;

/** Drivers forget to tap „დაიწყე"; don't call a trip late the minute it is due. */
const START_GRACE_MS = 20 * MINUTE_MS;

/** The reminder ladder's 3h ask has gone out by now, so silence starts to mean something. */
const CONFIRM_EXPECTED_MS = 3 * HOUR_MS;

/** Close enough to departure that a driver on his way should be reporting a position. */
const GPS_EXPECTED_WITHIN_MS = 2 * HOUR_MS;

/** A position older than this is not "a few minutes ago", it is a phone that stopped. */
const GPS_SILENT_MS = 3 * HOUR_MS;

/** Under this much room between two jobs, one slipping takes the other with it. */
const TURNAROUND_TIGHT_MS = 45 * MINUTE_MS;
const TURNAROUND_SNUG_MS = 90 * MINUTE_MS;

/** Below this many finished jobs a rate is noise, not a record. */
const RECORD_MIN_JOBS = 3;

const W_PAST_PICKUP_UNCONFIRMED = 50;
const W_REMINDER_IGNORED = 40;
const W_NOT_CONFIRMED = 15;
const W_PAST_PICKUP_CONFIRMED = 15;
const W_TURNAROUND_TIGHT = 20;
const W_TURNAROUND_SNUG = 10;
const W_GPS_SILENT = 15;
const W_WEAK_CONFIRM_BAD = 20;
const W_WEAK_CONFIRM_SOFT = 10;
const W_WEAK_COMPLETION = 15;

const LEVEL_HIGH = 50;
const LEVEL_MEDIUM = 25;
const LEVEL_LOW = 10;

export type BookingRiskLevel = 'none' | 'low' | 'medium' | 'high';

export type BookingRiskReasonCode =
  /** Pickup time has passed, nobody has heard from him and the trip never started. */
  | 'pastPickupUnconfirmed'
  /** The one-hour reminder went out and he still has not confirmed. */
  | 'reminderIgnored'
  /** Departure is near and the booking is still unconfirmed. */
  | 'notConfirmed'
  /** Confirmed and almost certainly driving — he just never tapped start. */
  | 'pastPickupNotStarted'
  /** Another job of his ends very close to this one's start. */
  | 'tightTurnaround'
  /** He shared a position once, and it has not moved in hours. */
  | 'gpsSilent'
  /** His record: he often does not answer when a job is assigned. */
  | 'weakConfirmRate'
  /** His record: he often does not finish what he takes. */
  | 'weakCompletionRate'
  /** Context only — too few finished jobs to have a record either way. */
  | 'noRecord';

export type BookingRiskReason = {
  code: BookingRiskReasonCode;
  /** Contribution to the score. Zero means "explains, does not accuse". */
  weight: number;
  /** Numbers for the translated sentence. */
  params?: Record<string, string | number>;
};

export type BookingRiskAssessment = {
  level: BookingRiskLevel;
  score: number;
  /** Heaviest first, so the card can show one line and the rest on request. */
  reasons: BookingRiskReason[];
};

export const NO_BOOKING_RISK: BookingRiskAssessment = { level: 'none', score: 0, reasons: [] };

/** The booking columns this needs — all of them already selected everywhere. */
export type BookingRiskBooking = Pick<
  BookingRow,
  'id' | 'status' | 'driver_id' | 'date_display' | 'driver_confirmed_1h' | 'reminder_1h_sent'
>;

export type BookingBusyBlock = { start: number; end: number };

export type BookingRiskInput = {
  booking: BookingRiskBooking;
  /** Composite dispatch score for the assigned driver, when we have one. */
  rank?: DriverRankScore;
  /** The driver's other commitments around this booking (this one excluded). */
  otherBlocks?: BookingBusyBlock[];
  /**
   * Last position this driver ever shared, or `null`/undefined when he has
   * never shared one. Undefined and null mean the same thing here on purpose:
   * no opinion, never a mark against him.
   */
  lastSeenMs?: number | null;
  nowMs?: number;
};

function levelFromScore(score: number): BookingRiskLevel {
  if (score >= LEVEL_HIGH) return 'high';
  if (score >= LEVEL_MEDIUM) return 'medium';
  if (score >= LEVEL_LOW) return 'low';
  return 'none';
}

/**
 * True when this booking is in the window where a no-show is still a live
 * question. Anything else — no driver, already driving, finished, cancelled,
 * months away — is skipped before a single query is made.
 */
export function bookingRiskIsAssessable(
  booking: BookingRiskBooking,
  nowMs = Date.now(),
): boolean {
  // `pending` has no driver to judge; `in_progress` means he turned up; the
  // rest are over. Only an accepted-and-not-yet-started booking can no-show.
  if (booking.status !== 'accepted') return false;
  if (!booking.driver_id?.trim()) return false;
  const start = bookingStartMs(booking);
  if (start === null) return false;
  if (start - nowMs > HORIZON_MS) return false;
  if (nowMs - start > STALE_MS) return false;
  return true;
}

export function assessBookingRisk(input: BookingRiskInput): BookingRiskAssessment {
  const now = input.nowMs ?? Date.now();
  const booking = input.booking;

  if (!bookingRiskIsAssessable(booking, now)) return NO_BOOKING_RISK;

  const start = bookingStartMs(booking);
  if (start === null) return NO_BOOKING_RISK;

  // Two buckets, kept apart on purpose: `live` is what is happening to THIS
  // booking, `record` is who the driver has been. Only `live` can raise an
  // alarm — see the capping rule where they are combined.
  const live: BookingRiskReason[] = [];
  const record: BookingRiskReason[] = [];
  const push = (
    into: BookingRiskReason[],
    code: BookingRiskReasonCode,
    weight: number,
    params?: Record<string, string | number>,
  ) => {
    into.push(params ? { code, weight, params } : { code, weight });
  };
  const add = (
    code: BookingRiskReasonCode,
    weight: number,
    params?: Record<string, string | number>,
  ) => push(live, code, weight, params);

  const confirmed = booking.driver_confirmed_1h === true;
  const msToStart = start - now;
  const overdueMs = -msToStart;

  // ── What is happening right now ────────────────────────────────────────────

  if (overdueMs > START_GRACE_MS) {
    const minutes = Math.max(1, Math.round(overdueMs / MINUTE_MS));
    if (confirmed) {
      // He promised he would be there and this is usually just a missed tap,
      // so it is worth mentioning and not worth alarming anyone about.
      add('pastPickupNotStarted', W_PAST_PICKUP_CONFIRMED, { minutes });
    } else {
      add('pastPickupUnconfirmed', W_PAST_PICKUP_UNCONFIRMED, { minutes });
    }
  } else if (!confirmed) {
    if (booking.reminder_1h_sent === true) {
      // The server asked him directly, an hour before departure. Silence after
      // that is the strongest warning this data can give.
      add('reminderIgnored', W_REMINDER_IGNORED);
    } else if (msToStart <= CONFIRM_EXPECTED_MS) {
      const minutes = Math.max(1, Math.round(msToStart / MINUTE_MS));
      add('notConfirmed', W_NOT_CONFIRMED, { minutes });
    }
  }

  // ── How much room he has left himself ──────────────────────────────────────

  let tightestGapMs: number | null = null;
  for (const block of input.otherBlocks ?? []) {
    if (!Number.isFinite(block.end) || block.end > start) continue;
    const gap = start - block.end;
    if (gap < 0) continue;
    if (tightestGapMs === null || gap < tightestGapMs) tightestGapMs = gap;
  }
  if (tightestGapMs !== null && tightestGapMs < TURNAROUND_SNUG_MS) {
    const minutes = Math.max(0, Math.round(tightestGapMs / MINUTE_MS));
    add(
      'tightTurnaround',
      tightestGapMs < TURNAROUND_TIGHT_MS ? W_TURNAROUND_TIGHT : W_TURNAROUND_SNUG,
      { minutes },
    );
  }

  // ── Whether his phone is still talking to us ───────────────────────────────

  // Only a position that exists and went stale counts. No position at all is
  // the normal state for a driver who has not started the trip yet, and
  // treating it as a warning would flag almost every booking in the app.
  if (
    typeof input.lastSeenMs === 'number' &&
    Number.isFinite(input.lastSeenMs) &&
    msToStart <= GPS_EXPECTED_WITHIN_MS &&
    now - input.lastSeenMs > GPS_SILENT_MS
  ) {
    const hours = Math.max(1, Math.round((now - input.lastSeenMs) / HOUR_MS));
    add('gpsSilent', W_GPS_SILENT, { hours });
  }

  // ── His record, which only ever explains ───────────────────────────────────

  const liveScore = live.reduce((sum, r) => sum + r.weight, 0);

  // Nothing is actually happening to this booking, so there is nothing to warn
  // about — however poor the assigned driver's history is. This is rule (1) at
  // the top of the file, and it is the single most important line here.
  if (liveScore === 0) return NO_BOOKING_RISK;

  const rank = input.rank;
  const hasRecord = (rank?.completedCount ?? 0) >= RECORD_MIN_JOBS;

  if (rank && hasRecord) {
    if (rank.confirmRate < 0.5) {
      push(record, 'weakConfirmRate', W_WEAK_CONFIRM_BAD, {
        percent: Math.round(rank.confirmRate * 100),
      });
    } else if (rank.confirmRate < 0.75) {
      push(record, 'weakConfirmRate', W_WEAK_CONFIRM_SOFT, {
        percent: Math.round(rank.confirmRate * 100),
      });
    }
    if (rank.completionRate < 0.7) {
      push(record, 'weakCompletionRate', W_WEAK_COMPLETION, {
        percent: Math.round(rank.completionRate * 100),
      });
    }
  }

  // A newcomer is not a risk — the whole dispatch design exists to give him
  // jobs. But when something else has already raised a flag, the company
  // deserves to know there is no track record behind it either way. Weight 0:
  // it is a footnote, never a mark against him.
  if (rank?.isNewDriver === true || (rank && !hasRecord)) {
    push(record, 'noRecord', 0, { jobs: rank?.completedCount ?? 0 });
  }

  // The record can at most DOUBLE a concern a live signal already raised; it
  // can never set the level by itself. Without this cap a driver with a thin
  // record would get a red badge for a merely unconfirmed booking, every
  // company would learn to ignore red, and the feature would be worthless.
  const recordScore = Math.min(
    record.reduce((sum, r) => sum + r.weight, 0),
    liveScore,
  );

  const reasons = [...live, ...record].sort((a, b) => b.weight - a.weight);
  const score = Math.min(100, liveScore + recordScore);

  return { level: levelFromScore(score), score, reasons };
}

export function topBookingRiskReason(
  assessment: BookingRiskAssessment | null | undefined,
): BookingRiskReason | null {
  if (!assessment || assessment.level === 'none') return null;
  return assessment.reasons[0] ?? null;
}

/** i18n key for a reason's sentence. */
export function bookingRiskReasonKey(code: BookingRiskReasonCode): string {
  return `bookingRisk.reason.${code}`;
}

// ─── Loading the signals ─────────────────────────────────────────────────────

type ScheduleBlockRow = { driver_id: string; booking_id: string | null; end_time: string };

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Last GPS heartbeat per driver. A failure here means "no opinion", not "stale". */
async function fetchLastSeenByDriver(driverIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (driverIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('driver_locations')
      .select('driver_id, updated_at')
      .in('driver_id', driverIds);
    if (error || !Array.isArray(data)) return out;
    for (const row of data as { driver_id: string; updated_at: string | null }[]) {
      const ms = timeOf(row.updated_at);
      const id = String(row.driver_id ?? '').trim();
      if (id && ms !== null) out.set(id, ms);
    }
  } catch {
    // Reading positions is a nice-to-have; the other signals stand alone.
  }
  return out;
}

async function fetchBlocksByDriver(
  driverIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Map<string, ScheduleBlockRow[]>> {
  const out = new Map<string, ScheduleBlockRow[]>();
  if (driverIds.length === 0) return out;
  try {
    const { data, error } = await fetchOverlappingSchedulesForDrivers(
      driverIds,
      rangeStart,
      rangeEnd,
    );
    if (error || !Array.isArray(data)) return out;
    for (const row of data) {
      const id = String(row.driver_id ?? '').trim();
      if (!id) continue;
      const list = out.get(id) ?? [];
      list.push({ driver_id: id, booking_id: row.booking_id ?? null, end_time: row.end_time });
      out.set(id, list);
    }
  } catch {
    // Same: no schedule data simply removes the turnaround signal.
  }
  return out;
}

/**
 * Assess a whole list of bookings in one round of queries.
 *
 * Returns only the bookings that have something to say, so a caller can treat
 * a missing entry as "nothing to report" without checking the level.
 */
export async function fetchBookingRiskMap(
  bookings: BookingRiskBooking[],
  nowMs = Date.now(),
): Promise<Map<string, BookingRiskAssessment>> {
  const result = new Map<string, BookingRiskAssessment>();

  const candidates = bookings.filter((b) => bookingRiskIsAssessable(b, nowMs));
  if (candidates.length === 0) return result;

  const driverIds = [
    ...new Set(candidates.map((b) => String(b.driver_id ?? '').trim()).filter(Boolean)),
  ];
  if (driverIds.length === 0) return result;

  const starts = candidates
    .map((b) => bookingStartMs(b))
    .filter((ms): ms is number => ms !== null);
  // Reach back far enough to catch the job that ends just before the earliest
  // pickup; a day tour's block is long, but only its end matters here.
  const rangeStart = new Date(Math.min(...starts) - 12 * HOUR_MS);
  const rangeEnd = new Date(Math.max(...starts) + HOUR_MS);

  const [ranks, blocks, lastSeen] = await Promise.all([
    fetchDriverRankScores(driverIds).catch(() => new Map<string, DriverRankScore>()),
    fetchBlocksByDriver(driverIds, rangeStart, rangeEnd),
    fetchLastSeenByDriver(driverIds),
  ]);

  for (const booking of candidates) {
    const driverId = String(booking.driver_id ?? '').trim();
    const otherBlocks: BookingBusyBlock[] = [];
    for (const row of blocks.get(driverId) ?? []) {
      // A booking's own busy block is not a turnaround against itself.
      if (row.booking_id && row.booking_id === booking.id) continue;
      const end = timeOf(row.end_time);
      if (end !== null) otherBlocks.push({ start: end, end });
    }

    const assessment = assessBookingRisk({
      booking,
      rank: ranks.get(driverId),
      otherBlocks,
      lastSeenMs: lastSeen.get(driverId) ?? null,
      nowMs,
    });
    if (assessment.level !== 'none') result.set(booking.id, assessment);
  }

  return result;
}
