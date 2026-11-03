// duplicates.ts — is the booking about to be created already there?
//
// The same request is easily booked twice: the same file uploaded again, a
// forwarded copy of a message already booked, a programme whose model answer
// listed one transfer twice. Before the server approves an imported booking
// it looks at the company's own bookings for the same day, and if one looks
// like the same trip the agency is asked first — it may be a second group on
// the same flight, so it is a question, never a refusal.

import { samePlace } from './review.ts';

export type ExistingBooking = {
  id: string;
  voucher_code: string | null;
  kind: string | null;
  status: string | null;
  date_display: string | null;
  pickup_time: string | null;
  from_location: string | null;
  to_location: string | null;
  route?: string | null;
  flight_number: string | null;
  passengers: number | null;
};

export type DuplicateReason = 'same_flight' | 'same_trip' | 'same_tour';

/** What the agency is shown about a booking that may be the same one. No guest name or phone. */
export type DuplicateMatch = {
  voucher: string | null;
  kind: string;
  date: string | null;
  time: string | null;
  from: string | null;
  to: string | null;
  passengers: number | null;
  status: string | null;
  reason: DuplicateReason;
};

/** Bookings that no longer happen are not duplicates of anything. */
const CLOSED = new Set(['cancelled', 'rejected']);

/** Two pickups this close on the same day, between the same places, are the same trip. */
export const SAME_TRIP_MINUTES = 60;

const TBILISI_MS = 4 * 3600e3;

/** The calendar day in Tbilisi of an ISO instant ("2026-05-15"), or null. */
export function tbilisiDay(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + TBILISI_MS).toISOString().slice(0, 10);
}

/** Minutes after midnight of a "HH:MM" clock, or null. */
function minutesOf(clock: unknown): number | null {
  const m = typeof clock === 'string' ? /^(\d{1,2}):(\d{2})/.exec(clock.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The pickup clock of a booking: its own pickup_time, else the clock of its date in Tbilisi (not midnight). */
export function pickupClock(b: { date_display?: unknown; pickup_time?: unknown }): string | null {
  const own = typeof b.pickup_time === 'string' && minutesOf(b.pickup_time) !== null ? b.pickup_time.trim().slice(0, 5) : null;
  if (own) return own;
  if (typeof b.date_display !== 'string') return null;
  const t = Date.parse(b.date_display);
  if (!Number.isFinite(t)) return null;
  const clock = new Date(t + TBILISI_MS).toISOString().slice(11, 16);
  return clock === '00:00' ? null : clock;
}

function flightKey(v: unknown): string | null {
  const k = typeof v === 'string' ? v.toUpperCase().replace(/[\s-]+/g, '') : '';
  return k.length >= 3 ? k : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * The company's bookings that look like the one about to be created: the same
 * Tbilisi day and the same flight; or the same kind of service between the
 * same places within an hour (a day tour: from the same place); or a tour
 * starting the same day. At most five, the closest first.
 */
export function findDuplicates(insert: any, existing: readonly ExistingBooking[]): DuplicateMatch[] {
  const kind = str(insert?.kind) ?? 'transfer';
  const day = tbilisiDay(insert?.date_display);
  if (!day) return [];
  const flight = flightKey(insert?.flight_number);
  const clock = minutesOf(pickupClock(insert ?? {}));
  const from = str(insert?.from_location) ?? str(insert?.route);
  const to = str(insert?.to_location);

  const found: { m: DuplicateMatch; gap: number }[] = [];
  for (const b of existing) {
    if (CLOSED.has(String(b.status ?? ''))) continue;
    if (tbilisiDay(b.date_display) !== day) continue;
    const bKind = str(b.kind) ?? 'transfer';
    const bClock = minutesOf(pickupClock(b));
    const gap = clock !== null && bClock !== null ? Math.abs(clock - bClock) : SAME_TRIP_MINUTES;
    let reason: DuplicateReason | null = null;

    const bFlight = flightKey(b.flight_number);
    if (kind === 'tour' || bKind === 'tour') {
      if (kind === 'tour' && bKind === 'tour') reason = 'same_tour';
    } else if (flight && bFlight) {
      // Two different flights are two different trips.
      if (bFlight === flight) reason = 'same_flight';
    } else if (bKind === kind && gap <= SAME_TRIP_MINUTES) {
      const bFrom = str(b.from_location) ?? str(b.route ?? null);
      const bTo = str(b.to_location);
      const fromSame = !!from && !!bFrom && samePlace(from, bFrom);
      const toSame = kind === 'day_tour' ? true : !!to && !!bTo && samePlace(to, bTo);
      if (fromSame && toSame) reason = 'same_trip';
    }
    if (!reason) continue;
    found.push({
      gap,
      m: {
        voucher: str(b.voucher_code),
        kind: bKind,
        date: day,
        time: bClock !== null ? pickupClock(b) : null,
        from: str(b.from_location) ?? str(b.route ?? null),
        to: str(b.to_location),
        passengers: typeof b.passengers === 'number' ? b.passengers : null,
        status: str(b.status),
        reason,
      },
    });
  }
  return found.sort((a, b) => a.gap - b.gap).slice(0, 5).map((x) => x.m);
}

/** The window of `date_display` values to load: the day before to the day after (ISO strings compare in order). */
export function searchWindow(dateDisplay: unknown): { from: string; to: string } | null {
  if (typeof dateDisplay !== 'string') return null;
  const t = Date.parse(dateDisplay);
  if (!Number.isFinite(t)) return null;
  return { from: new Date(t - 36 * 3600e3).toISOString(), to: new Date(t + 36 * 3600e3).toISOString() };
}

/** A review token's fingerprint: one approval per reviewed service, however many times it is sent. */
export async function reviewKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
