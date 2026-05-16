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
  driver_id: string;
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

/**
 * Columns needed for the driver photo screen + row identity.
 * PK is `id` (uuid); `driver_id` references auth.users(id).
 */
const VEHICLE_SELECT =
  'driver_id,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,is_verified,updated_at';

/**
 * Load the driver's vehicle row by `driver_id` (at most one row expected).
 */
export async function fetchVehicleByDriver(driverId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .eq('driver_id', driverId)
    .limit(1)
    .maybeSingle();
  return { data: data as VehicleRow | null, error };
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
  if (fields.type !== undefined && fields.type !== null) {
    const normalized = normalizeVehicleType(fields.type);
    if (!normalized) {
      return { fields: out, error: new Error('აირჩიეთ ტრანსპორტის ტიპი') };
    }
    out.type = normalized;
  }
  if (fields.class !== undefined && fields.class !== null) {
    const normalized = normalizeVehicleClass(fields.class);
    if (!normalized) {
      return { fields: out, error: new Error('აირჩიეთ კლასი') };
    }
    out.class = normalized;
  }
  return { fields: out, error: null };
}

/**
 * Persist one photo URL. PK is `id` (uuid); DB generates `id` on insert.
 *
 * New rows require NOT NULL `type` — pass `vehicleType` (e.g. from a UI selector); defaults to `'sedan'`.
 */
export async function saveVehiclePhotoUrl(
  driverId: string,
  column: VehiclePhotoKey,
  publicUrl: string,
  vehicleType: string = 'sedan',
): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const normalizedType = normalizeVehicleType(vehicleType) ?? 'sedan';

  const { data: existing, error: selErr } = await supabase
    .from('vehicles')
    .select('driver_id')
    .eq('driver_id', driverId)
    .limit(1)
    .maybeSingle();

  if (selErr) {
    return { error: new Error(selErr.message) };
  }

  const cleanUrl = storagePublicUrlBase(publicUrl);

  if (existing?.driver_id) {
    const { error } = await supabase
      .from('vehicles')
      .update({ [column]: cleanUrl, updated_at: now })
      .eq('driver_id', driverId);

    return { error: error ? new Error(error.message) : null };
  }

  const photos: Record<VehiclePhotoKey, string | null> = {
    photo_front: null,
    photo_left: null,
    photo_right: null,
    photo_interior: null,
    photo_rear: null,
  };
  photos[column] = cleanUrl;

  const { error } = await supabase.from('vehicles').insert({
    driver_id: driverId,
    type: normalizedType,
    class: null,
    model: null,
    color: null,
    year: null,
    plate: null,
    ...photos,
    is_verified: false,
    updated_at: now,
  });

  return { error: error ? new Error(error.message) : null };
}

/** Updates or inserts type/class without touching photo URLs. */
export async function saveVehicleInfo(
  driverId: string,
  type: string | null,
  vehicleClass: string | null,
): Promise<{ error: Error | null }> {
  return saveVehicleDetails(driverId, { type, class: vehicleClass });
}

/** Updates vehicle metadata (type, class, model, color, year, plate). Always stores English codes. */
export async function saveVehicleDetails(
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
  if (normErr) {
    return { error: normErr };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('vehicles').upsert(
    {
      driver_id: driverId,
      ...normalizedFields,
      updated_at: now,
    },
    { onConflict: 'driver_id' },
  );
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
  const bust = (u: string | null) => (u && u.startsWith('http') ? `${storagePublicUrlBase(u)}?t=${Date.now()}` : u);
  return {
    photo_front: bust(row.photo_front),
    photo_left: bust(row.photo_left),
    photo_right: bust(row.photo_right),
    photo_interior: bust(row.photo_interior),
    photo_rear: bust(row.photo_rear),
  };
}

export { rowToUrlsWithCacheBust };
