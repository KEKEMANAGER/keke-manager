import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * The road the car took during a trip.
 *
 * GPS needs no internet, mobile data does. In the mountains the phone keeps
 * knowing where it is but cannot tell anyone, so the company's map froze on
 * the last point for hours. The points are kept here instead — about one
 * every half minute — and sent in batches whenever the connection allows, so
 * the company sees the whole day's road and the pin catches up at once.
 */

export type TrailPoint = { latitude: number; longitude: number; recorded_at: string };

type BufferedPoint = TrailPoint & { driver_id: string; booking_id: string | null };

const BUFFER_KEY = 'trail:buffer:v1';
const LAST_KEY = 'trail:last:v1';
/** One point per this long while standing... */
export const TRAIL_MIN_GAP_MS = 30_000;
/** ...or sooner once the car has moved this far. */
export const TRAIL_MIN_MOVE_M = 150;
/** A full day and more at one point a half minute. */
const MAX_BUFFER = 4000;
const UPLOAD_BATCH = 400;

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a fix is worth keeping after the previous kept one. */
export function keepTrailPoint(
  prev: { latitude: number; longitude: number; at: number } | null,
  next: { latitude: number; longitude: number; at: number },
): boolean {
  if (!prev) return true;
  const dt = next.at - prev.at;
  if (dt <= 0) return false;
  if (dt >= TRAIL_MIN_GAP_MS) return true;
  return dt >= 5_000 && distanceM(prev, next) >= TRAIL_MIN_MOVE_M;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Keep the fixes of a batch that are worth keeping, for this trip. */
export async function addTrailPoints(
  driverId: string,
  bookingId: string | null,
  fixes: { latitude: number; longitude: number; at: number }[],
): Promise<number> {
  if (!driverId || fixes.length === 0) return 0;
  let last = await readJson<{ latitude: number; longitude: number; at: number } | null>(LAST_KEY, null);
  const kept: BufferedPoint[] = [];
  for (const f of fixes) {
    if (!Number.isFinite(f.latitude) || !Number.isFinite(f.longitude) || !Number.isFinite(f.at)) continue;
    if (!keepTrailPoint(last, f)) continue;
    last = f;
    kept.push({
      driver_id: driverId,
      booking_id: bookingId,
      latitude: f.latitude,
      longitude: f.longitude,
      recorded_at: new Date(f.at).toISOString(),
    });
  }
  if (kept.length === 0) return 0;
  try {
    const buffer = await readJson<BufferedPoint[]>(BUFFER_KEY, []);
    const next = [...(Array.isArray(buffer) ? buffer : []), ...kept].slice(-MAX_BUFFER);
    await AsyncStorage.multiSet([
      [BUFFER_KEY, JSON.stringify(next)],
      [LAST_KEY, JSON.stringify(last)],
    ]);
  } catch {
    // the storage is full or gone: the live pin still works
  }
  return kept.length;
}

let uploading: Promise<number> | null = null;
let lastUploadAt = 0;

/**
 * Send what was kept. Returns how many points went up; whatever could not go
 * stays for the next try. `force` skips the once-a-minute pacing.
 */
export function uploadTrail(force = false): Promise<number> {
  if (uploading) return uploading;
  uploading = (async () => {
    const buffer = await readJson<BufferedPoint[]>(BUFFER_KEY, []);
    if (!Array.isArray(buffer) || buffer.length === 0) return 0;
    if (!force && buffer.length < 20 && Date.now() - lastUploadAt < 60_000) return 0;
    let sent = 0;
    let rest = buffer;
    while (rest.length > 0) {
      const batch = rest.slice(0, UPLOAD_BATCH);
      const { error } = await supabase
        .from('driver_location_trail')
        .upsert(batch, { onConflict: 'driver_id,recorded_at', ignoreDuplicates: true });
      if (error) break;
      sent += batch.length;
      rest = rest.slice(batch.length);
    }
    if (sent > 0) {
      lastUploadAt = Date.now();
      // Points added while uploading are behind the ones sent: keep them.
      const latest = await readJson<BufferedPoint[]>(BUFFER_KEY, []);
      const uploaded = new Set(buffer.slice(0, sent).map((p) => `${p.driver_id}|${p.recorded_at}`));
      const keep = (Array.isArray(latest) ? latest : []).filter((p) => !uploaded.has(`${p.driver_id}|${p.recorded_at}`));
      try {
        if (keep.length === 0) await AsyncStorage.removeItem(BUFFER_KEY);
        else await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(keep));
      } catch {
        // sent twice at worst; the database ignores the duplicates
      }
    }
    return sent;
  })().finally(() => {
    uploading = null;
  });
  return uploading;
}

/**
 * The trip's road for the company's map, oldest first: the latest 1000 points
 * (about eight hours), which is as many as the server hands out at once.
 */
export async function fetchTrail(bookingId: string, sinceIso?: string): Promise<TrailPoint[]> {
  const id = bookingId?.trim();
  if (!id) return [];
  let q = supabase
    .from('driver_location_trail')
    .select('latitude, longitude, recorded_at')
    .eq('booking_id', id)
    .order('recorded_at', { ascending: false })
    .limit(1000);
  if (sinceIso) q = q.gte('recorded_at', sinceIso);
  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return (data as TrailPoint[])
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .reverse();
}
