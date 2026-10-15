/**
 * Offer a booking first to the driver who is already going to be there.
 *
 * A transfer that drops a group in Kazbegi at 13:00 leaves a driver standing in
 * Kazbegi with an empty car and a three-hour drive home. A 15:00 pickup out of
 * Kazbegi is, for him, free money and no positioning cost — and for the company
 * the single most likely booking to be accepted quickly, because the driver has
 * nothing to lose by taking it. This is the oldest trick in transport
 * dispatch ("backhaul", "empty leg") and the data to do it has been sitting in
 * `driver_schedules` unused.
 *
 * What this module does NOT do, deliberately:
 *
 *   • It does not exclude anybody. It marks recipients, and the mark is a sort
 *     tier in `buildRatingWaves` exactly like region coverage. Wave 1 fills to
 *     the same size, wave 2 still carries everyone else, so a driver loses
 *     nothing because a colleague happened to be nearby.
 *   • It does not send its own push. The driver hears about the booking in the
 *     ordinary first wave, at the ordinary moment.
 *   • It does not read another company's bookings. The matching happens inside
 *     `public.drivers_finishing_near`, which gives back nothing but a subset of
 *     the driver ids we handed it.
 *
 * Every failure path leaves the recipients untouched, which is the dispatch
 * behaviour that existed before this file.
 */

import {
  regionPlaceKeywords,
  resolveRegionFromText,
  type GeorgiaRegionCode,
} from './georgiaRegions';
import { parseStoredDateTime } from './dateTime';
import type { PushRecipientLike } from './driverRatingSort';
import { supabase } from './supabase';

/**
 * How long before the pickup a finishing job still counts as a chain.
 *
 * Three hours is about the drive from Tbilisi to the far end of most Georgian
 * routes: a driver who finishes earlier than that has time to go home, and
 * whether he is "nearby" stops being a safe guess.
 */
export const EMPTY_LEG_LEAD_MINUTES = 180;

export type EmptyLegPickup = {
  /** Where the new booking starts, as the operator typed it. */
  fromLocation?: string | null;
  /** The booking's route line, used only if the pickup text names no place. */
  route?: string | null;
  /** When it starts. Anything unparseable disables the whole thing. */
  startAt?: string | Date | null;
};

function startMs(value: EmptyLegPickup['startAt']): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  const parsed = parseStoredDateTime(value ?? null);
  return parsed ? parsed.getTime() : null;
}

/**
 * The place names that mean "near this pickup".
 *
 * Region granularity, not street granularity: in Georgia a region is an hour or
 * two of driving, which is the scale at which repositioning actually matters,
 * and it is the only scale the stored free-text locations can support. The raw
 * pickup text goes in too, so a hotel whose name carries its city still matches
 * when the region table does not recognise the hotel.
 */
export function emptyLegPlaceKeys(pickup: EmptyLegPickup): string[] {
  const keys = new Set<string>();

  const raw = pickup.fromLocation?.trim();
  if (raw) keys.add(raw.toLowerCase());

  const region: GeorgiaRegionCode | null =
    resolveRegionFromText(pickup.fromLocation) ?? resolveRegionFromText(pickup.route);
  if (region) {
    for (const place of regionPlaceKeywords(region)) {
      const key = place.trim().toLowerCase();
      if (key.length >= 4) keys.add(key);
    }
  }

  return [...keys].filter((k) => k.length >= 4);
}

/** Driver ids, out of the ones given, who finish a job near this pickup in time. */
export async function fetchDriversFinishingNearPickup(
  driverIds: string[],
  pickup: EmptyLegPickup,
): Promise<Set<string>> {
  const empty = new Set<string>();

  const ids = [...new Set(driverIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return empty;

  const start = startMs(pickup.startAt);
  if (start === null) return empty;

  const placeKeys = emptyLegPlaceKeys(pickup);
  // No recognisable place means no honest answer, and guessing here would put
  // the wrong driver at the front of the queue.
  if (placeKeys.length === 0) return empty;

  try {
    const { data, error } = await supabase.rpc('drivers_finishing_near', {
      p_driver_ids: ids,
      p_start: new Date(start).toISOString(),
      p_lead_minutes: EMPTY_LEG_LEAD_MINUTES,
      p_place_keys: placeKeys,
    });
    if (error || !Array.isArray(data)) {
      if (error && __DEV__) {
        console.warn('[emptyLegChaining] lookup failed:', error.message);
      }
      return empty;
    }
    const known = new Set(ids);
    for (const value of data as unknown[]) {
      const id = String(value ?? '').trim();
      // Only ever trust ids we asked about.
      if (id && known.has(id)) empty.add(id);
    }
  } catch (e) {
    if (__DEV__) console.warn('[emptyLegChaining] lookup threw:', e);
    return new Set<string>();
  }

  return empty;
}

/**
 * Tag recipients who are finishing nearby, leaving everything else as it was.
 *
 * Returns the same objects when there is nothing to tag, so a caller can use
 * the result unconditionally.
 */
export async function markRecipientsFinishingNearPickup<T extends PushRecipientLike>(
  recipients: T[],
  pickup: EmptyLegPickup,
): Promise<T[]> {
  if (recipients.length <= 1) return recipients;

  const nearby = await fetchDriversFinishingNearPickup(
    recipients.map((r) => r.userId),
    pickup,
  );
  if (nearby.size === 0) return recipients;

  if (__DEV__) {
    console.log('[emptyLegChaining] finishing near pickup:', [...nearby]);
  }

  return recipients.map((r) => (nearby.has(r.userId) ? { ...r, endsNearPickup: true } : r));
}
