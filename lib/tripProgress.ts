/**
 * What the driver gets out of the trip his own phone is recording.
 *
 * Until now the background location task did exactly one thing: write the
 * driver's position into a row the company reads. Nothing in that stream ever
 * came back to the driver — which is both a missed feature and, as App Review
 * put it, indistinguishable from following staff around.
 *
 * This is the other half of it. From the same points it works out how far he has
 * actually driven, how fast he is going, how long until he reaches the address
 * on the booking, and whether he has arrived. All of that only works while he is
 * driving with Maps in front of him or the screen dark, which is precisely the
 * situation the location background mode exists for.
 *
 * State lives in AsyncStorage keyed by booking, because the OS is free to tear
 * the JS context down and build it again between two location batches, and a
 * trip's progress has to survive that without the driver noticing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { geocodeLocationName } from './osrmRouting';

const KEY_PREFIX = 'trip-progress:';

/** Close enough to the address to call it an arrival; GPS in a city is rarely better. */
export const ARRIVAL_RADIUS_M = 150;

/** Under this a vehicle is standing, not crawling — such segments must not drag the average down. */
const MOVING_SPEED_MPS = 1.5;

/** The first ETA, before the trip has produced a speed of its own. ~40 km/h. */
const FALLBACK_SPEED_MPS = 11;

/** Weight of the newest segment in the speed average: low enough that one bad fix cannot swing it. */
const SPEED_SMOOTHING = 0.25;

/** A single jump beyond this is a GPS artefact, not distance driven. */
const MAX_PLAUSIBLE_SEGMENT_M = 3000;

/** Ignore a second fix that lands on top of the previous one; it only adds noise. */
const MIN_SEGMENT_M = 8;

export type Coords = { latitude: number; longitude: number };

export type TripDestination = Coords & {
  /** The address as written on the booking, so the driver recognises what he is looking at. */
  label: string;
};

export type TripProgress = {
  bookingId: string;
  startedAt: number;
  /** Metres actually driven, summed segment by segment. */
  distanceM: number;
  lastPoint: (Coords & { at: number }) | null;
  /** Smoothed speed across the segments where the vehicle was moving. */
  speedMps: number | null;
  destination: TripDestination | null;
  /** Set once, the first time he comes within ARRIVAL_RADIUS_M of the destination. */
  arrivedAt: number | null;
};

function key(bookingId: string): string {
  return `${KEY_PREFIX}${bookingId}`;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function validCoords(value: unknown): value is Coords {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Coords>;
  return finite(c.latitude) && finite(c.longitude);
}

function emptyProgress(bookingId: string): TripProgress {
  return {
    bookingId,
    startedAt: Date.now(),
    distanceM: 0,
    lastPoint: null,
    speedMps: null,
    destination: null,
    arrivedAt: null,
  };
}

/** Metres between two points on the sphere. Plenty accurate at the distances a car covers. */
export function haversineMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function readProgress(bookingId: string): Promise<TripProgress | null> {
  const id = bookingId?.trim();
  if (!id) return null;
  try {
    const raw = await AsyncStorage.getItem(key(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripProgress> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    // Anything unreadable is treated as absent rather than trusted: a corrupt
    // record would otherwise show the driver a distance that never happened.
    return {
      bookingId: id,
      startedAt: finite(parsed.startedAt) ? parsed.startedAt : Date.now(),
      distanceM: finite(parsed.distanceM) && parsed.distanceM >= 0 ? parsed.distanceM : 0,
      lastPoint:
        parsed.lastPoint && validCoords(parsed.lastPoint) && finite(parsed.lastPoint.at)
          ? { ...parsed.lastPoint }
          : null,
      speedMps: finite(parsed.speedMps) && parsed.speedMps > 0 ? parsed.speedMps : null,
      destination:
        parsed.destination && validCoords(parsed.destination)
          ? {
              latitude: parsed.destination.latitude,
              longitude: parsed.destination.longitude,
              label: String(parsed.destination.label ?? '').slice(0, 200),
            }
          : null,
      arrivedAt: finite(parsed.arrivedAt) ? parsed.arrivedAt : null,
    };
  } catch {
    return null;
  }
}

async function writeProgress(progress: TripProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(key(progress.bookingId), JSON.stringify(progress));
  } catch (e) {
    // Losing a write costs one segment of distance, never the trip.
    if (__DEV__) console.warn('[tripProgress] write failed:', e);
  }
}

export async function clearProgress(bookingId: string): Promise<void> {
  const id = bookingId?.trim();
  if (!id) return;
  try {
    await AsyncStorage.removeItem(key(id));
  } catch {
    // ignore
  }
}

/**
 * The address as the driver should read it, without the ", Georgia" the maps
 * hand-off appends for the sake of third-party geocoders.
 */
export function tripTargetLabel(query: string | null | undefined): string {
  return (query ?? '')
    .trim()
    .replace(/,\s*(Georgia|საქართველო)\s*$/i, '')
    .trim();
}

/**
 * Turn the address written on the booking into a point we can measure against.
 *
 * Bookings carry addresses as text — "თბილისის აეროპორტი" — because that is what
 * a tour operator types. The pricing calculator already keeps a hand-checked
 * table of the places Georgian transport actually runs between, in the spellings
 * companies actually use, so that is asked first and is both faster and more
 * reliable here than any general geocoder. The device's own geocoder is the
 * fallback for a street address nobody has catalogued.
 *
 * A failure is not worth reporting: the trip still records distance, it simply
 * runs without an arrival time, which is better than a wrong one.
 */
export async function geocodeTripTarget(
  query: string | null | undefined,
): Promise<Coords | null> {
  const q = query?.trim();
  if (!q) return null;

  const label = tripTargetLabel(q) || q;

  try {
    const known = await geocodeLocationName(label);
    if (known && finite(known.lat) && finite(known.lon)) {
      return { latitude: known.lat, longitude: known.lon };
    }
  } catch (e) {
    if (__DEV__) console.warn('[tripProgress] preset geocode failed:', e);
  }

  try {
    const results = await Location.geocodeAsync(q);
    const first = results?.[0];
    if (first && finite(first.latitude) && finite(first.longitude)) {
      return { latitude: first.latitude, longitude: first.longitude };
    }
  } catch (e) {
    if (__DEV__) console.warn('[tripProgress] device geocode failed:', e);
  }

  return null;
}

/** Remember where this trip is heading, so the background task can measure the gap. */
export async function setDestination(
  bookingId: string,
  destination: TripDestination | null,
): Promise<TripProgress | null> {
  const id = bookingId?.trim();
  if (!id) return null;
  const current = (await readProgress(id)) ?? emptyProgress(id);
  // A new destination is a new leg, so a previous arrival no longer applies.
  const next: TripProgress = { ...current, destination, arrivedAt: null };
  await writeProgress(next);
  return next;
}

export function distanceToDestinationM(progress: TripProgress | null): number | null {
  if (!progress?.destination || !progress.lastPoint) return null;
  return haversineMeters(progress.lastPoint, progress.destination);
}

/**
 * Minutes to the destination at the speed this trip has actually been driven.
 *
 * Straight-line distance against measured speed, which on Georgian intercity
 * roads lands close enough to be useful and is honest about what it is. The
 * point is that it keeps updating while he drives — a number frozen at the
 * moment he opened Maps would be worse than none.
 */
export function etaMinutes(progress: TripProgress | null): number | null {
  const metres = distanceToDestinationM(progress);
  if (metres === null) return null;
  const speed = progress?.speedMps && progress.speedMps > MOVING_SPEED_MPS
    ? progress.speedMps
    : FALLBACK_SPEED_MPS;
  const minutes = metres / speed / 60;
  if (!finite(minutes) || minutes < 0) return null;
  return Math.max(1, Math.round(minutes));
}

export type RecordPointResult = {
  progress: TripProgress;
  /** True on the single batch where he crossed into the arrival radius. */
  justArrived: boolean;
};

/**
 * Fold one position into the trip.
 *
 * Called from the background task, so it must be cheap, must never throw, and
 * must assume the previous call happened in a JS context that no longer exists.
 */
export async function recordPoint(
  bookingId: string,
  coords: Coords,
  at: number = Date.now(),
): Promise<RecordPointResult | null> {
  const id = bookingId?.trim();
  if (!id || !validCoords(coords)) return null;

  const current = (await readProgress(id)) ?? emptyProgress(id);
  const previous = current.lastPoint;

  let distanceM = current.distanceM;
  let speedMps = current.speedMps;

  if (previous) {
    const segment = haversineMeters(previous, coords);
    const seconds = (at - previous.at) / 1000;

    // A jump too large to have been driven is a bad fix, and counting it would
    // quietly inflate the distance the driver is paid for.
    if (segment >= MIN_SEGMENT_M && segment <= MAX_PLAUSIBLE_SEGMENT_M) {
      distanceM += segment;

      if (seconds > 0.5) {
        const observed = segment / seconds;
        if (observed > MOVING_SPEED_MPS && observed < 70) {
          speedMps =
            speedMps === null
              ? observed
              : speedMps * (1 - SPEED_SMOOTHING) + observed * SPEED_SMOOTHING;
        }
      }
    }
  }

  const next: TripProgress = {
    ...current,
    distanceM,
    speedMps,
    lastPoint: { latitude: coords.latitude, longitude: coords.longitude, at },
  };

  let justArrived = false;
  if (next.destination && next.arrivedAt === null) {
    const gap = haversineMeters(coords, next.destination);
    if (gap <= ARRIVAL_RADIUS_M) {
      next.arrivedAt = at;
      justArrived = true;
    }
  }

  await writeProgress(next);
  return { progress: next, justArrived };
}

/**
 * Tell the driver he has arrived, without him having to look.
 *
 * The whole point of detecting this in the background is that his hands are on
 * the wheel: a banner he can glance at is the deliverable, and the company is
 * told by the same event elsewhere. Notification failures are swallowed for the
 * same reason every other local banner in this app swallows them — a revoked
 * permission must not break a trip.
 */
export async function notifyArrival(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch (e) {
    if (__DEV__) console.warn('[tripProgress] arrival banner failed:', e);
  }
}

/** Kilometres, at the one decimal that is actually meaningful at GPS accuracy. */
export function formatKm(distanceM: number): string {
  const km = Math.max(0, distanceM) / 1000;
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}
