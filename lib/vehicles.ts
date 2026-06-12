import { storagePublicUrlBase } from './mediaUpload';
import { supabase } from './supabase';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';
import {
  vehicleCanActivate,
  vehicleIsApproved,
  type VehicleVerificationStatus,
} from './vehicleVerification';

export type VehiclePhotoKey =
  | 'photo_front'
  | 'photo_left'
  | 'photo_right'
  | 'photo_interior'
  | 'photo_rear';

export type VehicleTechPassportKey = 'tech_passport_front' | 'tech_passport_back';

export type VehicleRow = {
  id: string;
  driver_id: string;
  is_active: boolean;
  photo_front: string | null;
  photo_left: string | null;
  photo_right: string | null;
  photo_interior: string | null;
  photo_rear: string | null;
  tech_passport_front: string | null;
  tech_passport_back: string | null;
  verification_status: VehicleVerificationStatus;
  rejection_reason: string | null;
  type: string | null;
  class: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  plate: string | null;
  make_id: number | null;
  model_id: number | null;
  passenger_capacity: number | null;
  is_verified: boolean | null;
  updated_at: string;
};

const VEHICLE_SELECT =
  'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,tech_passport_front,tech_passport_back,verification_status,rejection_reason,type,class,model,color,year,plate,make_id,model_id,passenger_capacity,is_verified,updated_at';

function normalizeVehicleRow(raw: Record<string, unknown>): VehicleRow {
  const isVerified = raw.is_verified === true;
  const statusRaw = raw.verification_status;
  const verification_status =
    statusRaw === 'pending' ||
    statusRaw === 'submitted' ||
    statusRaw === 'approved' ||
    statusRaw === 'rejected'
      ? statusRaw
      : isVerified
        ? 'approved'
        : 'pending';

  return {
    ...(raw as VehicleRow),
    tech_passport_front: (raw.tech_passport_front as string | null) ?? null,
    tech_passport_back: (raw.tech_passport_back as string | null) ?? null,
    rejection_reason: (raw.rejection_reason as string | null) ?? null,
    verification_status,
  };
}

function mapVehicleRows(data: unknown[]): VehicleRow[] {
  return data.map((row) => normalizeVehicleRow(row as Record<string, unknown>));
}

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
    data: mapVehicleRows(data ?? []),
    error: error ? new Error(error.message) : null,
  };
}

/** All active vehicles for a driver (multiple allowed). */
export async function fetchActiveVehiclesByDriver(driverId: string): Promise<{
  data: VehicleRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  return {
    data: mapVehicleRows(data ?? []),
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Returns one active vehicle (most recently updated) for display/admin fallbacks.
 */
export async function fetchVehicleByDriver(driverId: string): Promise<{
  data: VehicleRow | null;
  error: Error | null;
}> {
  const { data, error } = await fetchActiveVehiclesByDriver(driverId);
  if (error) return { data: null, error };
  return { data: data[0] ?? null, error: null };
}

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase();
}

function isDriverVehicleLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('duplicate key') &&
    (m.includes('driver_clerk_id') ||
      m.includes('vehicles_driver_clerk_id') ||
      m.includes('vehicles_driver_clerk_id_key'))
  );
}

/**
 * Returns true if the given plate is already registered on another driver's vehicle.
 * Same-driver duplicates are intentionally allowed.
 */
async function plateUsedByOtherDriver(
  plate: string,
  driverId: string,
  excludeVehicleId?: string,
): Promise<boolean> {
  const normalized = normalizePlate(plate);
  if (!normalized) return false;

  let query = supabase
    .from('vehicles')
    .select('id')
    .eq('plate', normalized)
    .neq('driver_id', driverId)
    .limit(1);

  if (excludeVehicleId) {
    query = query.neq('id', excludeVehicleId);
  }

  const { data, error } = await query.maybeSingle();
  if (error && __DEV__) {
    console.warn('[vehicles] plateUsedByOtherDriver', error.message);
  }
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
    make_id?: number | null;
    model_id?: number | null;
    passenger_capacity?: number | null;
  },
): Promise<{ data: VehicleRow | null; error: Error | null }> {
  const { fields: normalizedFields, error: normErr } = normalizeVehicleDbFields(fields);
  if (normErr) return { data: null, error: normErr };

  const plateRaw = normalizedFields.plate?.trim() ?? '';
  const plate = plateRaw ? normalizePlate(plateRaw) : null;
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
      verification_status: 'pending',
      rejection_reason: null,
      tech_passport_front: null,
      tech_passport_back: null,
      updated_at: now,
      ...normalizedFields,
      plate,
    })
    .select(VEHICLE_SELECT)
    .maybeSingle();

  if (error) {
    if (isDriverVehicleLimitError(error.message)) {
      return {
        data: null,
        error: new Error(
          'მეორე მანქანის დამატება ბაზაში არ არის ჩართული. გაუშვით migration: 20260518140000_vehicles_drop_driver_unique.sql',
        ),
      };
    }
    return { data: null, error: new Error(error.message) };
  }
  return { data: data ? normalizeVehicleRow(data as Record<string, unknown>) : null, error: null };
}

async function syncProfileVehicleFromActives(driverId: string): Promise<void> {
  const { data: remaining } = await supabase
    .from('vehicles')
    .select('type, class')
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (remaining?.type && remaining?.class) {
    await supabase
      .from('profiles')
      .upsert(
        { id: driverId, vehicle_type: remaining.type, vehicle_class: remaining.class },
        { onConflict: 'id' },
      );
  }
}

/**
 * Toggle `is_active` for one vehicle. Multiple vehicles may be active at once.
 * Syncs profiles from the toggled vehicle (on activate) or last active (on deactivate).
 */
export async function toggleVehicleActive(
  driverId: string,
  vehicleId: string,
): Promise<{ is_active: boolean; error: Error | null }> {
  const { data: current, error: fetchErr } = await supabase
    .from('vehicles')
    .select('is_active, type, class, is_verified, verification_status')
    .eq('id', vehicleId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (fetchErr) {
    return { is_active: false, error: new Error(fetchErr.message) };
  }
  if (!current) {
    return { is_active: false, error: new Error('მანქანა ვერ მოიძებნა') };
  }

  const nextActive = !current.is_active;

  if (nextActive && !vehicleCanActivate(current as Parameters<typeof vehicleCanActivate>[0])) {
    return {
      is_active: false,
      error: new Error(
        vehicleIsApproved(current as Parameters<typeof vehicleIsApproved>[0])
          ? 'მანქანის გააქტიურება ვერ მოხერხდა'
          : 'მანქანა ჯერ ადმინმა უნდა დაადასტუროს (ტექპასპორტი)',
      ),
    };
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ is_active: nextActive, updated_at: new Date().toISOString() })
    .eq('id', vehicleId)
    .eq('driver_id', driverId);

  if (error) {
    return { is_active: !!current.is_active, error: new Error(error.message) };
  }

  if (nextActive && current.type && current.class) {
    await supabase
      .from('profiles')
      .upsert(
        { id: driverId, vehicle_type: current.type, vehicle_class: current.class },
        { onConflict: 'id' },
      );
  } else if (!nextActive) {
    await syncProfileVehicleFromActives(driverId);
  }

  return { is_active: nextActive, error: null };
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
  make_id?: number | null;
  model_id?: number | null;
  passenger_capacity?: number | null;
}): { fields: typeof fields; error: Error | null } {
  const out = { ...fields };
  if (fields.passenger_capacity != null) {
    const cap = Number(fields.passenger_capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
      return { fields: out, error: new Error('სავარძლების რაოდენობა 1–100 უნდა იყოს') };
    }
    out.passenger_capacity = cap;
  }
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
    make_id?: number | null;
    model_id?: number | null;
    passenger_capacity?: number | null;
  },
): Promise<{ error: Error | null }> {
  const { fields: normalizedFields, error: normErr } = normalizeVehicleDbFields(fields);
  if (normErr) return { error: normErr };

  let plateForDb: string | null | undefined;
  if (fields.plate !== undefined) {
    const plateRaw = fields.plate?.trim() ?? '';
    plateForDb = plateRaw ? normalizePlate(plateRaw) : null;
    if (plateForDb) {
      const duplicate = await plateUsedByOtherDriver(plateForDb, driverId, vehicleId);
      if (duplicate) {
        return { error: new Error('სანომრე ნიშანი სხვა მძღოლს უკვე გამოიყენება') };
      }
    }
  }

  const payload: Record<string, unknown> = {
    ...normalizedFields,
    updated_at: new Date().toISOString(),
  };
  if (plateForDb !== undefined) {
    payload.plate = plateForDb;
  }

  const { error } = await supabase
    .from('vehicles')
    .update(payload)
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

/** Remove one photo URL from a vehicle row. */
export async function clearVehiclePhotoUrl(
  vehicleId: string,
  column: VehiclePhotoKey,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({ [column]: null, updated_at: new Date().toISOString() })
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
