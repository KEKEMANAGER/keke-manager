import { fetchFleetDriverIdsAround } from './fleet';
import { fetchLocationsForDriverIds } from './locations';
import { supabase } from './supabase';

export type CompanyGpsDriverPin = {
  driver_id: string;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  full_name: string | null;
  booking_id: string;
  booking_status: string;
  route: string | null;
  from_location: string | null;
  to_location: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  driver_phone: string | null;
  assigned_driver_id: string;
  host_driver_id: string | null;
  is_assigned_driver: boolean;
};

/** Stale location threshold — matches admin GPS maps (~5 min). */
export const COMPANY_GPS_STALE_MS = 5 * 60_000;

export function isCompanyGpsLocationStale(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > COMPANY_GPS_STALE_MS;
}

type ActiveBookingRow = {
  id: string;
  driver_id: string;
  status: string;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  driver_display_name: string | null;
  driver_phone: string | null;
  host_driver_id: string | null;
};

type DriverMeta = {
  booking_id: string;
  booking_status: string;
  route: string | null;
  from_location: string | null;
  to_location: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  driver_phone: string | null;
  full_name: string | null;
  assigned_driver_id: string;
  host_driver_id: string | null;
  is_assigned_driver: boolean;
};

function routeLine(meta: DriverMeta): string | null {
  const explicit = meta.route?.trim();
  if (explicit) return explicit;
  const parts = [meta.from_location, meta.to_location].filter(Boolean);
  return parts.length ? parts.join(' → ') : null;
}

/** Active-booking drivers for a company map (assigned driver + fleet expansion). */
export async function fetchCompanyActiveGpsDrivers(
  companyUserId: string,
): Promise<CompanyGpsDriverPin[]> {
  const companyId = companyUserId.trim();
  if (!companyId) return [];

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      'id, driver_id, status, from_location, to_location, route, vehicle_type, vehicle_class, driver_display_name, driver_phone, host_driver_id',
    )
    .eq('company_id', companyId)
    .in('status', ['accepted', 'in_progress'])
    .not('driver_id', 'is', null);

  if (error || !bookings?.length) return [];

  const metaByDriver = new Map<string, DriverMeta>();

  for (const raw of bookings as ActiveBookingRow[]) {
    const assignedId = raw.driver_id.trim();
    if (!assignedId) continue;

    const fleetIds = await fetchFleetDriverIdsAround(assignedId);
    for (const fleetId of fleetIds) {
      const isAssigned = fleetId === assignedId;
      const existing = metaByDriver.get(fleetId);
      if (existing && !(isAssigned && !existing.is_assigned_driver)) continue;

      metaByDriver.set(fleetId, {
        booking_id: raw.id,
        booking_status: raw.status,
        route: raw.route,
        from_location: raw.from_location,
        to_location: raw.to_location,
        vehicle_type: raw.vehicle_type,
        vehicle_class: raw.vehicle_class,
        driver_phone: isAssigned ? raw.driver_phone : (existing?.driver_phone ?? null),
        full_name: isAssigned
          ? raw.driver_display_name
          : (existing?.full_name ?? null),
        assigned_driver_id: assignedId,
        host_driver_id: raw.host_driver_id,
        is_assigned_driver: isAssigned,
      });
    }
  }

  const allIds = [...metaByDriver.keys()];
  if (allIds.length === 0) return [];

  const { data: locs } = await fetchLocationsForDriverIds(allIds);
  const locMap = new Map(locs.map((l) => [l.driver_id, l]));

  return allIds.map((driver_id) => {
    const meta = metaByDriver.get(driver_id)!;
    const loc = locMap.get(driver_id);
    return {
      driver_id,
      latitude: loc?.latitude ?? null,
      longitude: loc?.longitude ?? null,
      updated_at: loc?.updated_at ?? null,
      full_name: loc?.full_name ?? meta.full_name,
      booking_id: meta.booking_id,
      booking_status: meta.booking_status,
      route: routeLine(meta),
      from_location: meta.from_location,
      to_location: meta.to_location,
      vehicle_type: meta.vehicle_type,
      vehicle_class: meta.vehicle_class,
      driver_phone: meta.driver_phone,
      assigned_driver_id: meta.assigned_driver_id,
      host_driver_id: meta.host_driver_id,
      is_assigned_driver: meta.is_assigned_driver,
    };
  });
}
