import { sanitizeLanguageCodes } from './spokenLanguages';
import { supabase } from './supabase';
import {
  normalizeCapacityTier,
  normalizeModelGroup,
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleMatchesModelGroup,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

export type DriverProfileRow = {
  id: string;
  vehicle_type: VehicleTypeCode | null;
  vehicle_class: VehicleClassCode | null;
  push_token: string | null;
  is_verified: boolean | null;
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
    .select('id, vehicle_type, vehicle_class, push_token, is_verified')
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
    is_verified?: boolean | null;
  };

  return {
    data: {
      id: row.id,
      vehicle_type: normalizeVehicleType(row.vehicle_type),
      vehicle_class: normalizeVehicleClass(row.vehicle_class),
      push_token: row.push_token?.trim() || null,
      is_verified: row.is_verified ?? null,
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
    },
    { onConflict: 'id' },
  );

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true, error: null };
}

/** Persist spoken languages on both `users` and `profiles`. */
export async function saveDriverLanguages(
  userId: string,
  languages: string[],
): Promise<{ ok: boolean; error: Error | null }> {
  const id = userId.trim();
  if (!id) {
    return { ok: false, error: new Error('user id არ არის') };
  }
  const codes = sanitizeLanguageCodes(languages);

  const [usersRes, profilesRes] = await Promise.all([
    supabase.from('users').update({ languages: codes }).eq('id', id),
    supabase.from('profiles').upsert({ id, languages: codes }, { onConflict: 'id' }),
  ]);

  if (usersRes.error) {
    return { ok: false, error: new Error(usersRes.error.message) };
  }
  if (profilesRes.error) {
    return { ok: false, error: new Error(profilesRes.error.message) };
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

  // Update only push_token — never overwrite vehicle_type / vehicle_class via upsert.
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', id)
    .select('id, vehicle_type, vehicle_class, push_token')
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: new Error(updateError.message) };
  }

  if (updated) {
    if (__DEV__) {
      console.log('[push] profiles.push_token updated for user', id.slice(0, 8));
    }
    await supabase.from('users').update({ push_token: null }).eq('id', id);
    return { ok: true, error: null };
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id,
    push_token: token,
  });

  if (insertError) {
    return { ok: false, error: new Error(insertError.message) };
  }

  if (__DEV__) {
    console.log('[push] profiles.insert push_token-only row for user', id.slice(0, 8));
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

  const { error } = await supabase.from('profiles').update({ push_token: null }).eq('id', id);

  if (error) {
    return { ok: false, error: new Error(error.message) };
  }

  await supabase.from('users').update({ push_token: null }).eq('id', id);
  return { ok: true, error: null };
}

export async function fetchDriverBirthDate(
  userId: string,
): Promise<{ birthDate: string | null; error: Error | null }> {
  const id = userId.trim();
  if (!id) {
    return { birthDate: null, error: new Error('user id არ არის') };
  }
  // Birth dates are no longer readable from other people's profiles; one's
  // own comes through my_birth_date(). The direct read stays as a fallback
  // for a database that does not have the function yet.
  const rpc = await supabase.rpc('my_birth_date');
  if (!rpc.error) {
    const raw = rpc.data as string | null;
    return { birthDate: typeof raw === 'string' && raw.trim() ? raw.trim() : null, error: null };
  }
  if (!isMissingFunctionError(rpc.error)) {
    return { birthDate: null, error: new Error(rpc.error.message) };
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('birth_date')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return { birthDate: null, error: new Error(error.message) };
  }
  const raw = (data as { birth_date?: string | null } | null)?.birth_date;
  return { birthDate: typeof raw === 'string' && raw.trim() ? raw.trim() : null, error: null };
}

export async function saveDriverBirthDate(
  userId: string,
  birthDateIso: string | null,
): Promise<{ ok: boolean; error: Error | null }> {
  const id = userId.trim();
  if (!id) {
    return { ok: false, error: new Error('user id არ არის') };
  }
  // One's own date goes through set_my_birth_date(): the column is no longer
  // readable by app users, and an upsert reads it. The direct upsert stays as
  // a fallback for a database that does not have the function yet.
  const rpc = await supabase.rpc('set_my_birth_date', { p_birth_date: birthDateIso });
  if (!rpc.error) return { ok: true, error: null };
  if (!isMissingFunctionError(rpc.error)) {
    return { ok: false, error: new Error(rpc.error.message) };
  }
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, birth_date: birthDateIso }, { onConflict: 'id' });
  if (error) {
    return { ok: false, error: new Error(error.message) };
  }
  return { ok: true, error: null };
}

/** PostgREST's "no such function" (schema cache) or Postgres' undefined_function. */
function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883';
}

/**
 * Whether this driver has an active vehicle matching the booking type and class
 * (and, when the booking requested one, the exact capacity sub-category and/or
 * preferred model too).
 */
export async function driverProfileMatchesBooking(
  userId: string,
  bookingVehicleType: string,
  bookingVehicleClass: string | null | undefined,
  bookingCapacityTier?: string | null,
  bookingModelGroup?: string | null,
): Promise<boolean> {
  const bookingType = normalizeVehicleType(bookingVehicleType);
  const bookingClass = normalizeVehicleClass(bookingVehicleClass ?? '');
  if (!bookingType || !bookingClass) return false;
  const bookingTier = normalizeCapacityTier(bookingCapacityTier, bookingType);
  const bookingModelGroupNorm = normalizeModelGroup(bookingModelGroup, bookingType);

  const id = userId.trim();
  if (!id) return false;

  let query = supabase
    .from('vehicles')
    .select('id, model')
    .eq('driver_id', id)
    // Same guard as the push dispatch: a row with no plate is an abandoned
    // draft still carrying the form's default sedan/economy, not a car. Without
    // this, one stray tap on "add vehicle" earned a driver every sedan job.
    .not('plate', 'is', null)
    .neq('plate', '')
    .eq('is_active', true)
    .eq('type', bookingType)
    .eq('class', bookingClass);
  if (bookingTier) {
    query = query.eq('capacity_tier', bookingTier);
  }

  const { data, error } = await query;

  if (error) {
    if (__DEV__) console.warn('[driverProfileMatchesBooking]', error.message);
    return false;
  }

  const rows = (data ?? []) as { id: string; model: string | null }[];
  if (!bookingModelGroupNorm) return rows.length > 0;
  return rows.some((row) => vehicleMatchesModelGroup(row.model, bookingModelGroupNorm));
}
