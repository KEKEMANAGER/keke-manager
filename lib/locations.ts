import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';

/**
 * How the driver's phone is sending its position.
 * - `background`: the trip's background task runs, so updates keep coming with
 *   the app minimized or the screen off.
 * - `foreground`: only the open GPS screen sends; the pin stops when the app is
 *   minimized.
 * Null when the driver's app is older than this field.
 */
export type GpsMode = 'background' | 'foreground';

export type DriverLocationRow = {
  driver_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  gps_mode?: GpsMode | null;
};

export type DriverLocationWithInfo = DriverLocationRow & {
  full_name: string | null;
  booking_id: string | null;
  booking_status: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
};

// ─── Driver: write own location ─────────────────────────────────────────────

export async function upsertDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number,
  gpsMode?: GpsMode,
): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('driver_locations').upsert(
    {
      driver_id: driverId,
      latitude,
      longitude,
      updated_at: now,
      ...(gpsMode ? { gps_mode: gpsMode, gps_mode_at: now } : {}),
    },
    { onConflict: 'driver_id' },
  );
  return { error: error ? new Error(error.message) : null };
}

/**
 * A phone that stands still still says where it is this often. Before this a
 * driver waiting at a sightseeing stop sent nothing at all (the OS reported
 * only movement), so a perfectly working phone faded off the maps at every
 * stop and came back when the car moved again. Every half minute keeps him
 * live on all of them: the company's tracking map greys a pin after 60 s of
 * silence, the fleet view after 90 s, the admin map after 5 minutes.
 */
export const LOCATION_HEARTBEAT_MS = 30_000;
/** A move this far is sent at once… */
const LOCATION_MOVE_REPORT_M = 15;
/** …but not more than once every few seconds: the map needs no more, the battery and the database do. */
const LOCATION_MIN_GAP_MS = 5_000;

let lastReported: { latitude: number; longitude: number; at: number; driverId: string } | null = null;

function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether this position is worth a write: moved far enough, or quiet for a heartbeat's time. */
export function locationWorthReporting(
  driverId: string,
  latitude: number,
  longitude: number,
  now: number = Date.now(),
): boolean {
  const last = lastReported;
  if (!last || last.driverId !== driverId) return true;
  const elapsed = now - last.at;
  if (elapsed >= LOCATION_HEARTBEAT_MS || elapsed < 0) return true;
  if (elapsed < LOCATION_MIN_GAP_MS) return false;
  return metersBetween(last, { latitude, longitude }) >= LOCATION_MOVE_REPORT_M;
}

/**
 * The driver's position as the trip sends it — from the background task and
 * from the open GPS screen alike, which share this one pace: right away when
 * he has moved, every half minute while he stands. `upsertDriverLocation` writes
 * unconditionally and stays for callers that must (going online, first fix).
 */
export async function reportDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number,
  gpsMode?: GpsMode,
): Promise<{ error: Error | null; skipped: boolean }> {
  const now = Date.now();
  if (!locationWorthReporting(driverId, latitude, longitude, now)) {
    return { error: null, skipped: true };
  }
  const previous = lastReported;
  lastReported = { latitude, longitude, at: now, driverId };
  const { error } = await upsertDriverLocation(driverId, latitude, longitude, gpsMode);
  // A failed write must not hold the next one back for a whole heartbeat.
  if (error) lastReported = previous;
  return { error, skipped: false };
}

/** Forget the pace (tests, sign-out): the next position is written at once. */
export function resetLocationReporting(): void {
  lastReported = null;
}

export async function clearDriverLocation(driverId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('driver_locations').delete().eq('driver_id', driverId);
  return { error: error ? new Error(error.message) : null };
}

// ─── Company: single driver ──────────────────────────────────────────────────

export async function fetchDriverLocation(
  driverId: string,
): Promise<DriverLocationRow | null> {
  const { data } = await supabase
    .from('driver_locations')
    .select('driver_id, latitude, longitude, updated_at')
    .eq('driver_id', driverId)
    .maybeSingle();
  return data as DriverLocationRow | null;
}

export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (row: DriverLocationRow) => void,
) {
  return supabase
    .channel(`driver-loc-${driverId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
      (payload) => {
        const row = payload.new as Partial<DriverLocationRow>;
        if (row?.latitude != null && row?.longitude != null) {
          onUpdate(row as DriverLocationRow);
        }
      },
    )
    .subscribe();
}

// ─── Admin: all active drivers ───────────────────────────────────────────────

export async function fetchAllLocationsWithInfo(): Promise<{
  data: DriverLocationWithInfo[];
  error: Error | null;
}> {
  const { data: locs, error: locErr } = await supabase
    .from('driver_locations')
    .select('driver_id, latitude, longitude, updated_at');

  if (locErr) return { data: [], error: new Error(locErr.message) };
  if (!locs?.length) return { data: [], error: null };

  const ids = locs.map((l) => (l as DriverLocationRow).driver_id);

  const [{ data: users }, { data: bookings }] = await Promise.all([
    supabase.from(USERS_DIRECTORY).select('id, full_name').in('id', ids),
    supabase
      .from('bookings')
      .select('id, driver_id, status, vehicle_type, vehicle_class')
      .in('driver_id', ids)
      .in('status', ['accepted', 'in_progress']),
  ]);

  type UserRow = { id: string; full_name: string | null };
  type BookingRow = { id: string; driver_id: string; status: string; vehicle_type: string | null; vehicle_class: string | null };

  const userMap = new Map<string, string | null>(
    (users as UserRow[] ?? []).map((u) => [u.id, u.full_name]),
  );
  const bookingMap = new Map<string, BookingRow>(
    (bookings as BookingRow[] ?? []).map((b) => [b.driver_id, b]),
  );

  return {
    data: (locs as DriverLocationRow[]).map((loc) => {
      const b = bookingMap.get(loc.driver_id);
      return {
        ...loc,
        full_name: userMap.get(loc.driver_id) ?? null,
        booking_id: b?.id ?? null,
        booking_status: b?.status ?? null,
        vehicle_type: b?.vehicle_type ?? null,
        vehicle_class: b?.vehicle_class ?? null,
      };
    }),
    error: null,
  };
}

export function subscribeToAllLocations(onChange: () => void) {
  const channelName = `all-driver-locs-${Math.random().toString(36).slice(2, 10)}`;
  return supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
      onChange();
    })
    .subscribe();
}

export type DriverLocationPin = DriverLocationRow & {
  full_name: string | null;
  is_host?: boolean;
};

/** Fetch locations for multiple drivers (fleet map). */
export async function fetchLocationsForDriverIds(
  driverIds: string[],
): Promise<{ data: DriverLocationPin[]; error: Error | null }> {
  const ids = [...new Set(driverIds.map((d) => d.trim()).filter(Boolean))];
  if (ids.length === 0) return { data: [], error: null };

  const [{ data: locs, error: locErr }, { data: users }] = await Promise.all([
    supabase
      .from('driver_locations')
      .select('driver_id, latitude, longitude, updated_at, gps_mode')
      .in('driver_id', ids),
    supabase.from(USERS_DIRECTORY).select('id, full_name').in('id', ids),
  ]);

  if (locErr) return { data: [], error: new Error(locErr.message) };

  const nameMap = new Map(
    (users as { id: string; full_name: string | null }[] ?? []).map((u) => [u.id, u.full_name]),
  );

  return {
    data: ((locs ?? []) as DriverLocationRow[]).map((loc) => ({
      ...loc,
      full_name: nameMap.get(loc.driver_id) ?? null,
    })),
    error: null,
  };
}

export function subscribeToDriverLocations(
  driverIds: string[],
  onChange: () => void,
) {
  const ids = driverIds.filter(Boolean);
  const channelName = `fleet-locs-${Math.random().toString(36).slice(2, 10)}`;
  if (ids.length === 0) {
    return supabase.channel(channelName).subscribe();
  }
  const filter =
    ids.length === 1 ? `driver_id=eq.${ids[0]}` : `driver_id=in.(${ids.join(',')})`;
  return supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_locations', filter },
      () => onChange(),
    )
    .subscribe();
}
