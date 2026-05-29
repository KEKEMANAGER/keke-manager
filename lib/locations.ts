import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';

export type DriverLocationRow = {
  driver_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
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
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('driver_locations').upsert(
    { driver_id: driverId, latitude, longitude, updated_at: new Date().toISOString() },
    { onConflict: 'driver_id' },
  );
  return { error: error ? new Error(error.message) : null };
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
  return supabase
    .channel('all-driver-locs')
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
      .select('driver_id, latitude, longitude, updated_at')
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
  if (ids.length === 0) {
    return supabase.channel('fleet-locs-empty').subscribe();
  }
  const filter =
    ids.length === 1 ? `driver_id=eq.${ids[0]}` : `driver_id=in.(${ids.join(',')})`;
  return supabase
    .channel(`fleet-locs-${ids.join('-').slice(0, 40)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_locations', filter },
      () => onChange(),
    )
    .subscribe();
}
