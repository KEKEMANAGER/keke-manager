/**
 * Loads the admin "Fleet" tab (ავტოპარკი) and saves what the admin marks on
 * a driver. The sorting and the "what is missing" rules are in
 * lib/adminFleetLogic.ts.
 */
import { supabase } from './supabase';
import { sanitizeLanguageCodes } from './spokenLanguages';
import {
  buildFleetEntries,
  type FleetDriverInput,
  type FleetEntry,
  type FleetVehicleInput,
} from './adminFleetLogic';

const DRIVER_SELECT =
  'id, full_name, phone, city, languages, verification_status, is_verified, is_blocked, is_hired_driver, id_front, id_back, license_front, license_back, id_photo, license_photo';

const VEHICLE_SELECT =
  'id, driver_id, type, class, capacity_tier, model, plate, year, color, is_active, verification_status, passenger_capacity, tech_passport_front, tech_passport_back, photo_front, photo_rear, photo_left, photo_right, photo_interior';

export async function fetchFleetEntries(): Promise<{ data: FleetEntry[]; error: Error | null }> {
  const [driversRes, vehiclesRes] = await Promise.all([
    supabase.from('users').select(DRIVER_SELECT).eq('role', 'driver'),
    supabase.from('vehicles').select(VEHICLE_SELECT),
  ]);
  if (driversRes.error) return { data: [], error: new Error(driversRes.error.message) };
  if (vehiclesRes.error) return { data: [], error: new Error(vehiclesRes.error.message) };

  const drivers = ((driversRes.data ?? []) as FleetDriverInput[]).map((d) => ({
    ...d,
    languages: sanitizeLanguageCodes(Array.isArray(d.languages) ? d.languages : []),
  }));
  const vehicles = (vehiclesRes.data ?? []) as FleetVehicleInput[];
  return { data: buildFleetEntries(drivers, vehicles), error: null };
}

/**
 * The admin marks the languages a driver told him on the phone. The dispatch,
 * the driver's open-jobs list and his own profile screen all read
 * `users.languages` first, so that column is the one written (an admin may
 * update any user; `profiles` is writable only by its owner).
 */
export async function saveDriverLanguagesAsAdmin(
  driverId: string,
  codes: string[],
): Promise<{ languages: string[]; error: Error | null }> {
  const id = driverId.trim();
  if (!id) return { languages: [], error: new Error('driver id missing') };
  const clean = sanitizeLanguageCodes(codes);
  const { data, error } = await supabase
    .from('users')
    .update({ languages: clean })
    .eq('id', id)
    .eq('role', 'driver')
    .select('id, languages');
  if (error) return { languages: [], error: new Error(error.message) };
  // A refused update (no admin rights) changes no row and reports no error.
  const row = (data ?? [])[0] as { languages?: string[] | null } | undefined;
  if (!row) return { languages: [], error: new Error('not_saved') };
  return { languages: sanitizeLanguageCodes(Array.isArray(row.languages) ? row.languages : []), error: null };
}
