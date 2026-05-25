import { COLORS } from '../constants/theme';
import { supabase } from './supabase';
import type { DriverLocationRow } from './locations';
import { vehicleClassLabel, vehicleTypeLabel } from './vehicleCatalog';

export const ADMIN_GPS_ACTIVE_MS = 5 * 60_000;

export type AdminGpsDriverKind = 'regular' | 'guide' | 'host' | 'hired';

export type AdminGpsDriverLocation = DriverLocationRow & {
  full_name: string | null;
  booking_id: string | null;
  booking_status: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  vehicle_label: string | null;
  is_guide_driver: boolean;
  is_hired_driver: boolean;
  is_host: boolean;
  city: string | null;
  kind: AdminGpsDriverKind;
};

export type AdminGpsFilters = {
  kind: AdminGpsDriverKind | 'all';
  activity: 'all' | 'active' | 'inactive';
  city: string | 'all';
};

export function isAdminGpsActive(updatedAt: string, now = Date.now()): boolean {
  return now - new Date(updatedAt).getTime() <= ADMIN_GPS_ACTIVE_MS;
}

export function classifyAdminGpsDriver(u: {
  is_hired_driver: boolean | null;
  is_guide_driver: boolean | null;
  is_host: boolean;
}): AdminGpsDriverKind {
  if (u.is_hired_driver) return 'hired';
  if (u.is_guide_driver) return 'guide';
  if (u.is_host) return 'host';
  return 'regular';
}

export function adminGpsMarkerColor(loc: AdminGpsDriverLocation): string {
  if (!isAdminGpsActive(loc.updated_at)) return COLORS.textMuted;
  switch (loc.kind) {
    case 'hired':
      return COLORS.error;
    case 'guide':
      return COLORS.gold;
    case 'host':
      return COLORS.black;
    default:
      return COLORS.blue;
  }
}

export function adminGpsMarkerEmoji(loc: AdminGpsDriverLocation): string {
  if (loc.kind === 'guide') return '🎓';
  return '🚗';
}

function vehicleLabel(type: string | null, vehicleClass: string | null): string | null {
  const parts = [
    type ? vehicleTypeLabel(type) : null,
    vehicleClass ? vehicleClassLabel(vehicleClass) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Admin panel: all driver_locations enriched with role / fleet / booking context. */
export async function fetchAllActiveDriverLocations(): Promise<{
  data: AdminGpsDriverLocation[];
  error: Error | null;
}> {
  const { data: locs, error: locErr } = await supabase
    .from('driver_locations')
    .select('driver_id, latitude, longitude, updated_at');

  if (locErr) return { data: [], error: new Error(locErr.message) };
  if (!locs?.length) return { data: [], error: null };

  const ids = locs.map((l) => (l as DriverLocationRow).driver_id);

  const [{ data: users }, { data: bookings }, { data: fleetRows }] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, is_guide_driver, is_hired_driver, city')
      .in('id', ids),
    supabase
      .from('bookings')
      .select('id, driver_id, status, vehicle_type, vehicle_class')
      .in('driver_id', ids)
      .in('status', ['accepted', 'in_progress']),
    supabase.from('driver_fleet').select('host_driver_id'),
  ]);

  type UserRow = {
    id: string;
    full_name: string | null;
    is_guide_driver: boolean | null;
    is_hired_driver: boolean | null;
    city: string | null;
  };
  type BookingRow = {
    id: string;
    driver_id: string;
    status: string;
    vehicle_type: string | null;
    vehicle_class: string | null;
  };

  const hostIds = new Set(
    (fleetRows ?? []).map((r) => (r as { host_driver_id: string }).host_driver_id),
  );

  const userMap = new Map<string, UserRow>((users as UserRow[] ?? []).map((u) => [u.id, u]));
  const bookingMap = new Map<string, BookingRow>(
    (bookings as BookingRow[] ?? []).map((b) => [b.driver_id, b]),
  );

  const data = (locs as DriverLocationRow[]).map((loc) => {
    const u = userMap.get(loc.driver_id);
    const b = bookingMap.get(loc.driver_id);
    const is_host = hostIds.has(loc.driver_id);
    const kind = classifyAdminGpsDriver({
      is_hired_driver: !!u?.is_hired_driver,
      is_guide_driver: !!u?.is_guide_driver,
      is_host,
    });

    return {
      ...loc,
      full_name: u?.full_name ?? null,
      booking_id: b?.id ?? null,
      booking_status: b?.status ?? null,
      vehicle_type: b?.vehicle_type ?? null,
      vehicle_class: b?.vehicle_class ?? null,
      vehicle_label: vehicleLabel(b?.vehicle_type ?? null, b?.vehicle_class ?? null),
      is_guide_driver: !!u?.is_guide_driver,
      is_hired_driver: !!u?.is_hired_driver,
      is_host,
      city: u?.city ?? null,
      kind,
    } satisfies AdminGpsDriverLocation;
  });

  return { data, error: null };
}

export function filterAdminGpsLocations(
  locations: AdminGpsDriverLocation[],
  filters: AdminGpsFilters,
): AdminGpsDriverLocation[] {
  return locations.filter((loc) => {
    if (filters.kind !== 'all' && loc.kind !== filters.kind) return false;
    if (filters.city !== 'all' && (loc.city ?? '') !== filters.city) return false;
    const active = isAdminGpsActive(loc.updated_at);
    if (filters.activity === 'active' && !active) return false;
    if (filters.activity === 'inactive' && active) return false;
    return true;
  });
}

export function adminGpsCityOptions(locations: AdminGpsDriverLocation[]): string[] {
  const cities = new Set<string>();
  for (const loc of locations) {
    const c = loc.city?.trim();
    if (c) cities.add(c);
  }
  return Array.from(cities).sort((a, b) => a.localeCompare(b, 'ka'));
}

export function subscribeAdminGpsLocations(onChange: () => void) {
  return supabase
    .channel('admin-gps-all-locs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, () => {
      onChange();
    })
    .subscribe();
}
