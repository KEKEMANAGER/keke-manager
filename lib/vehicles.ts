import { supabase } from './supabase';

export type VehiclePhotoKey =
  | 'photo_front'
  | 'photo_left'
  | 'photo_right'
  | 'photo_interior'
  | 'photo_rear';

export type VehicleRow = {
  driver_clerk_id: string;
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
 * PK is `id` (uuid, default gen_random_uuid()); `driver_clerk_id` is the app lookup key.
 */
const VEHICLE_SELECT =
  'driver_clerk_id,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,is_verified,updated_at';

/**
 * Load the driver's vehicle row by `driver_clerk_id` (at most one row expected).
 */
export async function fetchVehicleByDriver(driverClerkId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .eq('driver_clerk_id', driverClerkId)
    .limit(1)
    .maybeSingle();
  return { data: data as VehicleRow | null, error };
}

/**
 * Persist one photo URL. PK is `id` (uuid); DB generates `id` on insert.
 *
 * New rows require NOT NULL `type` — pass `vehicleType` (e.g. from a UI selector); defaults to `'sedan'`.
 *
 * After migration `vehicles_driver_clerk_id_key`, `driver_clerk_id` is UNIQUE so you could switch
 * this to `.upsert(..., { onConflict: 'driver_clerk_id' })` later if desired.
 */
export async function saveVehiclePhotoUrl(
  driverClerkId: string,
  column: VehiclePhotoKey,
  publicUrl: string,
  vehicleType: string = 'sedan',
): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from('vehicles')
    .select('driver_clerk_id')
    .eq('driver_clerk_id', driverClerkId)
    .limit(1)
    .maybeSingle();

  if (selErr) {
    return { error: new Error(selErr.message) };
  }

  if (existing?.driver_clerk_id) {
    const { error } = await supabase
      .from('vehicles')
      .update({ [column]: publicUrl, updated_at: now })
      .eq('driver_clerk_id', driverClerkId);

    return { error: error ? new Error(error.message) : null };
  }

  const photos: Record<VehiclePhotoKey, string | null> = {
    photo_front: null,
    photo_left: null,
    photo_right: null,
    photo_interior: null,
    photo_rear: null,
  };
  photos[column] = publicUrl;

  const { error } = await supabase.from('vehicles').insert({
    driver_clerk_id: driverClerkId,
    type: vehicleType,
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
  driverClerkId: string,
  type: string | null,
  vehicleClass: string | null,
): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('vehicles').upsert(
    {
      driver_clerk_id: driverClerkId,
      type,
      class: vehicleClass,
      updated_at: now,
    },
    { onConflict: 'driver_clerk_id' },
  );
  return { error: error ? new Error(error.message) : null };
}
