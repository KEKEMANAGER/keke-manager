/**
 * Driving distance for a booking's route, with a shared cache.
 *
 * `osrmRouting` can answer this from Nominatim + OSRM, but those are public,
 * rate-limited services: asking them the same question from every phone every
 * time a company edits a price field is both slow and rude, and a throttled
 * answer silently becomes a missing price hint. So every answer is written back
 * to `route_distances`, and the next company to price the same leg gets it from
 * the database for free.
 */

import {
  estimateRoadDistanceKm,
  fetchDrivingDistanceKm,
  geocodeLocationName,
  type RouteSegment,
} from './osrmRouting';
import { supabase } from './supabase';

/** Rows are keyed on this, so it must match `upsert_route_distance` exactly. */
function routeKey(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same leg asked twice while the user types — answer from here, not the network. */
const memoryCache = new Map<string, number>();

function cacheId(from: string, to: string): string {
  return `${routeKey(from)}→${routeKey(to)}`;
}

async function readCachedLegs(
  legs: RouteSegment[],
): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const missing = legs.filter((leg) => {
    const id = cacheId(leg.from, leg.to);
    const hit = memoryCache.get(id);
    if (hit != null) {
      found.set(id, hit);
      return false;
    }
    return true;
  });
  if (missing.length === 0) return found;

  const fromKeys = [...new Set(missing.map((l) => routeKey(l.from)))];
  const toKeys = [...new Set(missing.map((l) => routeKey(l.to)))];

  const { data, error } = await supabase
    .from('route_distances')
    .select('from_key, to_key, distance_km')
    .in('from_key', fromKeys)
    .in('to_key', toKeys);

  if (error || !data) return found;

  for (const row of data as { from_key: string; to_key: string; distance_km: number }[]) {
    const km = Number(row.distance_km);
    if (!Number.isFinite(km) || km <= 0) continue;
    const id = `${row.from_key}→${row.to_key}`;
    memoryCache.set(id, km);
    found.set(id, km);
  }
  return found;
}

async function writeCachedLeg(leg: RouteSegment, km: number): Promise<void> {
  memoryCache.set(cacheId(leg.from, leg.to), km);
  // Best effort: a failed cache write costs one extra OSRM call later, nothing more.
  await supabase.rpc('upsert_route_distance', {
    p_from_key: routeKey(leg.from),
    p_to_key: routeKey(leg.to),
    p_km: km,
  });
}

export type RouteDistanceOutcome = {
  /** Total driving distance, or null when no leg could be resolved. */
  distanceKm: number | null;
  /** True when at least one leg was guessed from coordinates, or skipped entirely. */
  partial: boolean;
};

/**
 * One leg, best effort: cache → OSRM → straight-line guess.
 *
 * Returns `exact: false` for the guess so the screen can show „≈" rather than
 * implying a routed number.
 */
async function measureLeg(
  leg: RouteSegment,
): Promise<{ km: number; exact: boolean } | null> {
  const [fromPt, toPt] = await Promise.all([
    geocodeLocationName(leg.from),
    geocodeLocationName(leg.to),
  ]);
  if (!fromPt || !toPt) return null;

  const routed = await fetchDrivingDistanceKm(fromPt, toPt).catch(() => null);
  if (routed != null && routed > 0) return { km: routed, exact: true };

  const guessed = estimateRoadDistanceKm(fromPt, toPt, `${leg.from} ${leg.to}`);
  if (!Number.isFinite(guessed) || guessed <= 0) return null;
  return { km: guessed, exact: false };
}

/**
 * Total driving distance for a list of legs.
 *
 * A leg that cannot be resolved is skipped rather than failing the whole
 * estimate — a five-day tour with one unrecognised hotel name should still
 * price the other four days, flagged as partial.
 */
export async function resolveRouteDistanceKm(
  segments: RouteSegment[],
): Promise<RouteDistanceOutcome> {
  const legs = segments
    .map((s) => ({ from: String(s.from ?? '').trim(), to: String(s.to ?? '').trim() }))
    .filter((s) => s.from && s.to && routeKey(s.from) !== routeKey(s.to));

  if (legs.length === 0) return { distanceKm: null, partial: false };

  const cached = await readCachedLegs(legs);

  let total = 0;
  let resolved = 0;
  let missed = 0;

  for (const leg of legs) {
    const hit = cached.get(cacheId(leg.from, leg.to));
    if (hit != null) {
      total += hit;
      resolved += 1;
      continue;
    }

    const measured = await measureLeg(leg);
    if (!measured) {
      missed += 1;
      continue;
    }

    total += measured.km;
    resolved += 1;
    // Only a routed answer is worth sharing. Caching a straight-line guess would
    // hand every other company the same guess and hide that it was one.
    if (measured.exact) {
      void writeCachedLeg(leg, measured.km);
    } else {
      missed += 1;
    }
  }

  if (resolved === 0) return { distanceKm: null, partial: true };
  return {
    distanceKm: Math.round(total * 10) / 10,
    partial: missed > 0,
  };
}

/**
 * A transfer is one leg out; the return is priced by the model, not routed.
 * A tour is the itinerary's legs in order.
 */
export function segmentsFromTourDays(
  days: { from?: string | null; to?: string | null }[],
): RouteSegment[] {
  return days
    .map((d) => ({ from: String(d.from ?? '').trim(), to: String(d.to ?? '').trim() }))
    .filter((d) => d.from && d.to);
}
