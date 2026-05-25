import { resolveProfileAvatarUrl } from './profileAvatar';
import { fetchDriverAverageRating } from './ratings';
import { firstVehiclePhotoUrl } from './vehiclePhotos';
import { fetchVehiclesByDriver } from './vehicles';
import { driverMatchesRequiredLanguages } from './spokenLanguages';
import { supabase } from './supabase';
import {
  driverEligibleForOpenJobBroadcast,
  driverMatchesRequestedCategory,
  normalizeRequestedDriverCategory,
  type RequestedDriverCategory,
} from './driverCategory';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

export type DriverProfile = {
  user_id: string;
  full_name: string | null;
  is_verified: boolean;
  is_guide_driver: boolean;
  avatar_url: string | null;
  bio: string | null;
  languages: string[] | null;
  experience_years: number | null;
  vehicle: {
    photo_front: string | null;
    type: string | null;
    class: string | null;
    model: string | null;
    color: string | null;
    year: number | null;
    plate: string | null;
  } | null;
  rating: { average: number; count: number };
};

type UserProfileRow = {
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  languages?: string[] | null;
  experience_years?: number | null;
  is_verified?: boolean | null;
  is_guide_driver?: boolean | null;
};

export type MatchingDriver = {
  id: string;
  full_name: string | null;
  city: string | null;
  is_verified: boolean;
  avatar_url: string | null;
  languages: string[];
  experience_years: number;
  rating: string | null;
  rating_count: number;
  is_guide_driver: boolean;
  vehicle: {
    model: string | null;
    year: number | null;
    color: string | null;
    plate: string | null;
    photo_front: string | null;
  } | null;
};

type ProfileMatchRow = {
  id: string;
  vehicle_type: string | null;
  vehicle_class: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type UserRow = {
  id: string;
  full_name?: string | null;
  city?: string | null;
  avatar_url?: string | null;
  languages?: string[] | null;
  experience_years?: number | null;
  role?: string | null;
  is_verified?: boolean | null;
  is_hired_driver?: boolean | null;
  is_guide_driver?: boolean | null;
};

function computeRatingAverages(
  rows: { driver_id: string; overall: number }[],
): Map<string, { average: number; count: number }> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const id = String(row.driver_id);
    const prev = acc.get(id) ?? { sum: 0, count: 0 };
    prev.sum += Number(row.overall);
    prev.count += 1;
    acc.set(id, prev);
  }
  const out = new Map<string, { average: number; count: number }>();
  for (const [id, { sum, count }] of acc) {
    out.set(id, {
      average: Math.round((sum / count) * 10) / 10,
      count,
    });
  }
  return out;
}

/** Drivers whose `profiles` vehicle prefs match the booking selection. */
export async function fetchMatchingDrivers(
  vehicleType: string,
  vehicleClass: string,
  requiredLanguages?: string[] | null,
  cityFilter?: string | null,
  driverCategory?: RequestedDriverCategory | null,
): Promise<{ data: MatchingDriver[]; error: Error | null }> {
  const category = normalizeRequestedDriverCategory(driverCategory ?? 'all');
  const cityNorm = cityFilter?.trim() || null;
  const normType = normalizeVehicleType(vehicleType);
  const normClass = normalizeVehicleClass(vehicleClass);

  if (!normType || !normClass) {
    return { data: [], error: null };
  }

  let profileRows: ProfileMatchRow[] | null = null;
  let profileError: { message: string } | null = null;

  const primary = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, vehicle_type, vehicle_class')
    .eq('vehicle_type', normType)
    .eq('vehicle_class', normClass);

  if (!primary.error) {
    profileRows = (primary.data ?? []) as ProfileMatchRow[];
  } else {
    const fallback = await supabase
      .from('profiles')
      .select('id, avatar_url, vehicle_type, vehicle_class')
      .eq('vehicle_type', normType)
      .eq('vehicle_class', normClass);
    profileRows = (fallback.data ?? []) as ProfileMatchRow[];
    profileError = fallback.error;
  }

  if (profileError) {
    return { data: [], error: new Error(profileError.message) };
  }
  if (!profileRows?.length) {
    return { data: [], error: null };
  }

  const ids = profileRows.map((r) => String(r.id));

  const [usersRes, vehiclesRes, ratingsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, city, avatar_url, languages, experience_years, role, is_verified')
      .in('id', ids),
    supabase
      .from('vehicles')
      .select(
        'driver_id, model, year, color, plate, photo_front, photo_left, photo_right, photo_interior, photo_rear, is_active',
      )
      .in('driver_id', ids)
      .order('is_active', { ascending: false }),
    supabase.from('ratings').select('driver_id, overall').in('driver_id', ids),
  ]);

  if (usersRes.error) {
    return { data: [], error: new Error(usersRes.error.message) };
  }
  if (vehiclesRes.error) {
    return { data: [], error: new Error(vehiclesRes.error.message) };
  }

  const userById = new Map<string, UserRow>();
  if (usersRes.data) {
    for (const u of usersRes.data as UserRow[]) {
      userById.set(String(u.id), u);
    }
  }

  const vehicleByDriver = new Map<
    string,
    {
      model?: string | null;
      year?: number | null;
      color?: string | null;
      plate?: string | null;
      photo_front?: string | null;
      photo_left?: string | null;
      photo_right?: string | null;
      photo_interior?: string | null;
      photo_rear?: string | null;
    }
  >();
  for (const v of (vehiclesRes.data ?? []) as {
    driver_id: string;
    model?: string | null;
    year?: number | null;
    color?: string | null;
    plate?: string | null;
    photo_front?: string | null;
    photo_left?: string | null;
    photo_right?: string | null;
    photo_interior?: string | null;
    photo_rear?: string | null;
  }[]) {
    const key = String(v.driver_id);
    if (!vehicleByDriver.has(key)) {
      vehicleByDriver.set(key, v);
    }
  }

  const ratingByDriver = computeRatingAverages(
    (ratingsRes.data ?? []) as { driver_id: string; overall: number }[],
  );

  const drivers: MatchingDriver[] = [];

  for (const row of profileRows) {
    const driverId = String(row.id);
    const user = userById.get(driverId) ?? null;

    if (user?.role && user.role !== 'driver') {
      continue;
    }

    if (!driverEligibleForOpenJobBroadcast(user ?? {})) {
      continue;
    }

    if (!driverMatchesRequestedCategory(user ?? {}, category)) {
      continue;
    }

    const driverLangs = user?.languages ?? [];
    if (!driverMatchesRequiredLanguages(driverLangs, requiredLanguages)) {
      continue;
    }

    const driverCity = user?.city?.trim() ?? null;
    if (cityNorm && driverCity !== cityNorm) {
      continue;
    }

    const profileName =
      typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : null;
    const userName =
      typeof user?.full_name === 'string' && user.full_name.trim()
        ? user.full_name.trim()
        : null;
    const full_name = profileName ?? userName ?? null;

    const avatar_url = resolveProfileAvatarUrl(row.avatar_url, user?.avatar_url);

    const vehicle = vehicleByDriver.get(driverId) ?? null;
    const ratingStats = ratingByDriver.get(driverId);
    const avgRating =
      ratingStats && ratingStats.count > 0 ? ratingStats.average.toFixed(1) : null;

    drivers.push({
      id: driverId,
      full_name,
      city: driverCity,
      is_verified: !!user?.is_verified,
      avatar_url,
      languages: user?.languages ?? [],
      experience_years: user?.experience_years ?? 0,
      rating: avgRating,
      rating_count: ratingStats?.count ?? 0,
      is_guide_driver: user?.is_guide_driver === true,
      vehicle: vehicle
        ? {
            model: vehicle.model ?? null,
            year: vehicle.year ?? null,
            color: vehicle.color ?? null,
            plate: vehicle.plate ?? null,
            photo_front: firstVehiclePhotoUrl(vehicle),
          }
        : null,
    });
  }

  drivers.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ka'));

  return { data: drivers, error: null };
}

export async function fetchDriverProfile(
  driverUserId: string,
): Promise<{ data: DriverProfile | null; error: Error | null }> {
  const [userRes, profileRes, vehiclesRes, ratingRes] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, bio, languages, experience_years, is_verified, is_guide_driver, avatar_url')
      .eq('id', driverUserId)
      .maybeSingle(),
    supabase.from('profiles').select('avatar_url, full_name').eq('id', driverUserId).maybeSingle(),
    fetchVehiclesByDriver(driverUserId),
    fetchDriverAverageRating(driverUserId),
  ]);

  if (userRes.error) {
    return { data: null, error: new Error(userRes.error.message) };
  }

  const user = userRes.data as UserProfileRow | null;
  const profile = profileRes.data as { avatar_url?: string | null; full_name?: string | null } | null;
  const vehicles = vehiclesRes.data ?? [];
  const v = vehicles.find((row) => row.is_active) ?? vehicles[0] ?? null;

  const profileName =
    typeof profile?.full_name === 'string' && profile.full_name.trim()
      ? profile.full_name.trim()
      : null;
  const userName =
    typeof user?.full_name === 'string' && user.full_name.trim() ? user.full_name.trim() : null;

  return {
    data: {
      user_id: driverUserId,
      full_name: profileName ?? userName ?? null,
      is_verified: !!user?.is_verified,
      is_guide_driver: user?.is_guide_driver === true,
      avatar_url: resolveProfileAvatarUrl(profile?.avatar_url, user?.avatar_url),
      bio: user?.bio ?? null,
      languages: user?.languages ?? null,
      experience_years: user?.experience_years ?? null,
      vehicle: v
        ? {
            photo_front: firstVehiclePhotoUrl(v),
            type: normalizeVehicleType(v.type) ?? v.type ?? null,
            class: normalizeVehicleClass(v.class) ?? v.class ?? null,
            model: v.model ?? null,
            color: v.color ?? null,
            year: v.year ?? null,
            plate: v.plate ?? null,
          }
        : null,
      rating: { average: ratingRes.average, count: ratingRes.count },
    },
    error: null,
  };
}
