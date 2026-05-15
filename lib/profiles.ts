import { supabase } from './supabase';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

export type DriverProfileRow = {
  id: string;
  vehicle_type: VehicleTypeCode | null;
  vehicle_class: VehicleClassCode | null;
  push_token: string | null;
};

export type DriverVehiclePreferences = {
  vehicle_type: VehicleTypeCode;
  vehicle_class: VehicleClassCode;
};

export async function fetchDriverProfile(userId: string): Promise<{
  data: DriverProfileRow | null;
  error: Error | null;
}> {
  const id = userId.trim();
  if (!id) {
    return { data: null, error: new Error('user id არ არის') };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, vehicle_type, vehicle_class, push_token')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  if (!data) {
    return { data: null, error: null };
  }

  const row = data as {
    id: string;
    vehicle_type?: string | null;
    vehicle_class?: string | null;
    push_token?: string | null;
  };

  return {
    data: {
      id: row.id,
      vehicle_type: normalizeVehicleType(row.vehicle_type),
      vehicle_class: normalizeVehicleClass(row.vehicle_class),
      push_token: row.push_token?.trim() || null,
    },
    error: null,
  };
}

export async function saveDriverVehiclePreferences(
  userId: string,
  prefs: DriverVehiclePreferences,
): Promise<{ ok: boolean; error: Error | null }> {
  const id = userId.trim();
  const vehicle_type = normalizeVehicleType(prefs.vehicle_type);
  const vehicle_class = normalizeVehicleClass(prefs.vehicle_class);

  if (!id) {
    return { ok: false, error: new Error('user id არ არის') };
  }
  if (!vehicle_type) {
    return { ok: false, error: new Error('აირჩიეთ ავტომობილის ტიპი') };
  }
  if (!vehicle_class) {
    return { ok: false, error: new Error('აირჩიეთ ავტომობილის კლასი') };
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      id,
      vehicle_type,
      vehicle_class,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true, error: null };
}

export async function saveDriverPushToken(
  userId: string,
  pushToken: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const id = userId.trim();
  const token = pushToken.trim();
  if (!id || !token) {
    return { ok: false, error: new Error('push token ან user id არ არის') };
  }

  const updated_at = new Date().toISOString();

  // Update only push_token — never overwrite vehicle_type / vehicle_class via upsert.
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ push_token: token, updated_at })
    .eq('id', id)
    .select('id, vehicle_type, vehicle_class, push_token')
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: new Error(updateError.message) };
  }

  if (updated) {
    await supabase.from('users').update({ push_token: null }).eq('id', id);
    return { ok: true, error: null };
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id,
    push_token: token,
    updated_at,
  });

  if (insertError) {
    return { ok: false, error: new Error(insertError.message) };
  }

  await supabase.from('users').update({ push_token: null }).eq('id', id);
  return { ok: true, error: null };
}

/** Clears Expo push token on logout so this device stops receiving driver alerts. */
export async function clearProfilePushToken(userId: string): Promise<{ ok: boolean; error: Error | null }> {
  const id = userId.trim();
  if (!id) {
    return { ok: false, error: new Error('user id არ არის') };
  }

  const updated_at = new Date().toISOString();

  const { error } = await supabase.from('profiles').update({ push_token: null, updated_at }).eq('id', id);

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }

  await supabase.from('users').update({ push_token: null }).eq('id', id);
  return { ok: true, error: null };
}

/** Whether this driver's saved profile matches a booking's vehicle requirements. */
export async function driverProfileMatchesBooking(
  userId: string,
  bookingVehicleType: string,
  bookingVehicleClass: string,
): Promise<boolean> {
  const bookingType = normalizeVehicleType(bookingVehicleType);
  const bookingClass = normalizeVehicleClass(bookingVehicleClass);
  if (!bookingType || !bookingClass) return false;

  const { data: profile } = await fetchDriverProfile(userId);
  if (!profile?.vehicle_type || !profile?.vehicle_class) {
    return false;
  }

  return (
    profile.vehicle_type === bookingType && profile.vehicle_class === bookingClass
  );
}
