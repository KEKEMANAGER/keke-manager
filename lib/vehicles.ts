import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

export type VehiclePhotoKey =
  | 'photo_front'
  | 'photo_left'
  | 'photo_right'
  | 'photo_interior'
  | 'photo_rear';

export type VehicleRow = {
  id: string;
  driver_id: string;
  is_active: boolean;
  photo_front: string | null;
  photo_left: string | null;
  photo_right: string | null;
  photo_interior: string | null;
  photo_rear: string | null;
  type: string | null;
  class: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  plate: string | null;
  is_verified: boolean | null;
  updated_at: string;
};

const VEHICLE_SELECT =
  'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,is_verified,updated_at';

/** All vehicles for this driver, active first. */
export async function fetchVehiclesByDriver(driverId: string): Promise<{
  data: VehicleRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .eq('driver_id', driverId)
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false });
  return {
    data: (data ?? []) as VehicleRow[],
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Returns the active vehicle for a driver.
 * Kept for backwards-compatible callers (profile screen, admin views).
 */
export async function fetchVehicleByDriver(driverId: string): Promise<{
  data: VehicleRow | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .maybeSingle();
  return { data: data as VehicleRow | null, error: error ? new Error(error.message) : null };
}

/**
 * Returns true if the given plate is already registered on another driver's vehicle.
 * Same-driver duplicates are intentionally allowed (a driver may have multiple
 * vehicles with the same plate, e.g. re-registering under a new vehicle record).
 */
async function plateUsedByOtherDriver(
  plate: string,
  driverId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('vehicles')
    .select('id')
    .eq('plate', plate.trim())
    .neq('driver_id', driverId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** Insert a new (inactive) vehicle row and return it. */
export async function insertVehicle(
  driverId: string,
  fields: {
    type?: string | null;
    class?: string | null;
    model?: string | null;
    color?: string | null;
    year?: number | null;
    plate?: string | null;
  },
): Promise<{ data: VehicleRow | null; error: Error | null }> {
  const plate = fields.plate?.trim() ?? '';
  if (plate) {
    const duplicate = await plateUsedByOtherDriver(plate, driverId);
    if (duplicate) {
      return { data: null, error: new Error('სანომრე ნიშანი სხვა მძღოლს უკვე გამოიყენება') };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      driver_id: driverId,
      is_active: false,
      photo_front: null,
      photo_left: null,
      photo_right: null,
      photo_interior: null,
      photo_rear: null,
      is_verified: false,
      updated_at: now,
      ...fields,
    })
    .select(VEHICLE_SELECT)
    .maybeSingle();
  return { data: data as VehicleRow | null, error: error ? new Error(error.message) : null };
}

/**
 * Mark one vehicle as active for this driver (deactivates all others).
 * Also syncs type/class to profiles so notification matching stays accurate.
 */
export async function setActiveVehicle(
  driverId: string,
  vehicleId: string,
): Promise<{ error: Error | null }> {
  // Deactivate all vehicles for this driver first.
  await supabase.from('vehicles').update({ is_active: false }).eq('driver_id', driverId);

  // Activate the chosen vehicle (driver_id check prevents cross-driver writes).
  const { error } = await supabase
    .from('vehicles')
    .update({ is_active: true })
    .eq('id', vehicleId)
    .eq('driver_id', driverId);

  if (error) return { error: new Error(error.message) };

  // Sync type/class to profiles so push-notification matching stays current.
  const { data: v } = await supabase
    .from('vehicles')
    .select('type, class')
    .eq('id', vehicleId)
    .maybeSingle();
  if (v?.type && v?.class) {
    await supabase
      .from('profiles')
      .upsert(
        { id: driverId, vehicle_type: v.type, vehicle_class: v.class },
        { onConflict: 'id' },
      );
  }

  return { error: null };
}

/**
 * Delete a non-active vehicle.
 * Will silently no-op if the vehicle is active (is_active = false guard).
 */
export async function deleteVehicle(
  vehicleId: string,
  driverId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('driver_id', driverId)
    .eq('is_active', false);
  return { error: error ? new Error(error.message) : null };
}

function normalizeVehicleDbFields(fields: {
  type?: string | null;
  class?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | null;
  plate?: string | null;
}): { fields: typeof fields; error: Error | null } {
  const out = { ...fields };
  if (fields.type != null) {
    const n = normalizeVehicleType(fields.type);
    if (!n) return { fields: out, error: new Error('აირჩიეთ ტრანსპორტის ტიპი') };
    out.type = n;
  }
  if (fields.class != null) {
    const n = normalizeVehicleClass(fields.class);
    if (!n) return { fields: out, error: new Error('აირჩიეთ კლასი') };
    out.class = n;
  }
  return { fields: out, error: null };
}

/** Update metadata for a specific vehicle row (vehicleId + driverId safety check). */
export async function saveVehicleDetails(
  vehicleId: string,
  driverId: string,
  fields: {
    type?: string | null;
    class?: string | null;
    model?: string | null;
    color?: string | null;
    year?: number | null;
    plate?: string | null;
  },
): Promise<{ error: Error | null }> {
  const { fields: normalizedFields, error: normErr } = normalizeVehicleDbFields(fields);
  if (normErr) return { error: normErr };

  const plate = fields.plate?.trim() ?? '';
  if (plate) {
    const duplicate = await plateUsedByOtherDriver(plate, driverId);
    if (duplicate) {
      return { error: new Error('სანომრე ნიშანი სხვა მძღოლს უკვე გამოიყენება') };
    }
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ ...normalizedFields, updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .eq('driver_id', driverId);
  return { error: error ? new Error(error.message) : null };
}

/** Persist one photo URL for a specific vehicle (updates by vehicleId). */
export async function saveVehiclePhotoUrl(
  vehicleId: string,
  column: VehiclePhotoKey,
  publicUrl: string,
): Promise<{ error: Error | null }> {
  const cleanUrl = storagePublicUrlBase(publicUrl);
  const { error } = await supabase
    .from('vehicles')
    .update({ [column]: cleanUrl, updated_at: new Date().toISOString() })
    .eq('id', vehicleId);
  return { error: error ? new Error(error.message) : null };
}

function rowToUrlsWithCacheBust(row: VehicleRow | null): Record<VehiclePhotoKey, string | null> {
  if (!row) {
    return {
      photo_front: null,
      photo_left: null,
      photo_right: null,
      photo_interior: null,
      photo_rear: null,
    };
  }
  const bust = (u: string | null) =>
    u && u.startsWith('http') ? `${storagePublicUrlBase(u)}?t=${Date.now()}` : u;
  return {
    photo_front: bust(row.photo_front),
    photo_left: bust(row.photo_left),
    photo_right: bust(row.photo_right),
    photo_interior: bust(row.photo_interior),
    photo_rear: bust(row.photo_rear),
  };
}

export { rowToUrlsWithCacheBust };
