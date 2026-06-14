import { resolveProfileAvatarUrl } from './profileAvatar';
import { computeRatingAveragesFromRows, sortMatchingDrivers } from './driverRatingSort';
import { fetchDriverAverageRating } from './ratings';
import { firstVehiclePhotoUrl } from './vehiclePhotos';
import { fetchVehiclesByDriver } from './vehicles';
import { driverMatchesRequiredLanguages } from './spokenLanguages';
import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import {
  driverEligibleForOpenJobBroadcast,
  driverMatchesRequestedCategory,
  normalizeRequestedDriverCategory,
  type RequestedDriverCategory,
} from './driverCategory';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassRawValues,
  vehicleTypeRawValues,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

/** Booking vehicle type + class must match the driver's vehicle row exactly. */
function vehicleMatchesSelection(
  type: string | null | undefined,
  vehicleClass: string | null | undefined,
  normType: VehicleTypeCode,
  normClass: VehicleClassCode,
): boolean {
  const vt = normalizeVehicleType(type ?? '');
  const vc = normalizeVehicleClass(vehicleClass ?? '');
  return vt === normType && vc === normClass;
}

type DriverMatchExclusion = {
  driverId: string;
  step: string;
  detail?: Record<string, unknown>;
};

function logFetchMatchingDrivers(step: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[fetchMatchingDrivers] ${step}`, detail ?? '');
}

function logDriverExclusion(exclusions: DriverMatchExclusion[], entry: DriverMatchExclusion): void {
  exclusions.push(entry);
  if (!__DEV__) return;
  console.log(
    `[fetchMatchingDrivers] EXCLUDED ${entry.driverId} @ ${entry.step}`,
    entry.detail ?? '',
  );
}

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
    id: string | null;
    type: string | null;
    class: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    plate: string | null;
    passenger_capacity: number | null;
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

export type FetchMatchingDriversOptions = {
  /** `rating` for open broadcast lists; `name` when picking a specific driver. Default: `name`. */
  sortMode?: 'name' | 'rating';
};

/** Drivers whose `profiles` vehicle prefs match the booking selection. */
export async function fetchMatchingDrivers(
  vehicleType: string,
  vehicleClass: string,
  requiredLanguages?: string[] | null,
  cityFilter?: string | null,
  driverCategory?: RequestedDriverCategory | null,
  minPassengerCapacity?: number | null,
  options?: FetchMatchingDriversOptions,
): Promise<{ data: MatchingDriver[]; error: Error | null }> {
  const category = normalizeRequestedDriverCategory(driverCategory ?? 'all');
  const cityNorm = cityFilter?.trim() || null;
  const normType = normalizeVehicleType(vehicleType);
  const normClass = normalizeVehicleClass(vehicleClass);

  const exclusions: DriverMatchExclusion[] = [];

  if (!normType || !normClass) {
    logFetchMatchingDrivers('abort: invalid vehicle type/class', {
      vehicleType,
      vehicleClass,
      normType,
      normClass,
    });
    return { data: [], error: null };
  }

  const typeVariants = vehicleTypeRawValues(normType);
  const classVariants = vehicleClassRawValues(normClass);

  logFetchMatchingDrivers('1. vehicles query', {
    table: 'vehicles',
    filters: { type: typeVariants, class: classVariants },
    order: 'is_active desc',
    normType,
    normClass,
    minPassengerCapacity,
    driverCategory: category,
    cityFilter: cityNorm,
    requiredLanguages,
  });

  const vehiclesRes = await supabase
    .from('vehicles')
    .select(
      'id, driver_id, type, class, model, year, color, plate, passenger_capacity, photo_front, photo_left, photo_right, photo_interior, photo_rear, is_active, is_verified, verification_status',
    )
    .in('type', typeVariants)
    .in('class', classVariants)
    .eq('is_verified', true)
    .eq('verification_status', 'approved')
    .order('is_active', { ascending: false });

  if (vehiclesRes.error) {
    logFetchMatchingDrivers('vehicles query error', { message: vehiclesRes.error.message });
    return { data: [], error: new Error(vehiclesRes.error.message) };
  }

  logFetchMatchingDrivers('1. vehicles query result', {
    rowCount: vehiclesRes.data?.length ?? 0,
    driverIds: [...new Set((vehiclesRes.data ?? []).map((v) => String((v as { driver_id: string }).driver_id)))],
    rows: (vehiclesRes.data ?? []).map((v) => {
      const row = v as {
        driver_id: string;
        type?: string | null;
        class?: string | null;
        model?: string | null;
        passenger_capacity?: number | null;
        is_active?: boolean | null;
      };
      return {
        driver_id: row.driver_id,
        type: row.type,
        class: row.class,
        model: row.model,
        passenger_capacity: row.passenger_capacity,
        is_active: row.is_active,
        normalizedMatch: vehicleMatchesSelection(row.type, row.class, normType, normClass),
      };
    }),
  });

  type VehicleRow = {
    id: string;
    driver_id: string;
    type?: string | null;
    class?: string | null;
    model?: string | null;
    year?: number | null;
    color?: string | null;
    plate?: string | null;
    passenger_capacity?: number | null;
    photo_front?: string | null;
    photo_left?: string | null;
    photo_right?: string | null;
    photo_interior?: string | null;
    photo_rear?: string | null;
    is_active?: boolean | null;
  };

  const vehicleByDriver = new Map<string, VehicleRow>();

  for (const v of (vehiclesRes.data ?? []) as VehicleRow[]) {
    if (!vehicleMatchesSelection(v.type, v.class, normType, normClass)) {
      logDriverExclusion(exclusions, {
        driverId: String(v.driver_id),
        step: '2. vehicle row normalization',
        detail: {
          rawType: v.type,
          rawClass: v.class,
          normType,
          normClass,
        },
      });
      continue;
    }
    const key = String(v.driver_id);
    const existing = vehicleByDriver.get(key);
    if (!existing) {
      vehicleByDriver.set(key, v);
      continue;
    }
    // Prefer active vehicle when multiple rows match the same category.
    if (v.is_active && !existing.is_active) {
      vehicleByDriver.set(key, v);
    }
  }

  const candidateDriverIds = [...vehicleByDriver.keys()];
  logFetchMatchingDrivers('2. vehicle match candidates', {
    count: candidateDriverIds.length,
    driverIds: candidateDriverIds,
    vehiclesByDriver: Object.fromEntries(
      [...vehicleByDriver.entries()].map(([id, v]) => [
        id,
        {
          id: v.id,
          type: v.type,
          class: v.class,
          model: v.model,
          passenger_capacity: v.passenger_capacity,
          is_active: v.is_active,
        },
      ]),
    ),
  });

  if (candidateDriverIds.length === 0) {
    logFetchMatchingDrivers('done: no vehicles matched', { exclusions });
    return { data: [], error: null };
  }

  logFetchMatchingDrivers('3. parallel queries', {
    profiles: { table: 'profiles', filter: { id: candidateDriverIds } },
    users: { table: USERS_DIRECTORY, filter: { id: candidateDriverIds } },
    ratings: { table: 'ratings', filter: { driver_id: candidateDriverIds } },
  });

  const [profilesRes, usersRes, ratingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, vehicle_type, vehicle_class')
      .in('id', candidateDriverIds),
    supabase
      .from(USERS_DIRECTORY)
      .select(
        'id, full_name, city, avatar_url, languages, experience_years, role, is_verified, is_guide_driver, is_hired_driver',
      )
      .in('id', candidateDriverIds),
    supabase.from('ratings').select('driver_id, overall').in('driver_id', candidateDriverIds),
  ]);

  if (profilesRes.error) {
    return { data: [], error: new Error(profilesRes.error.message) };
  }
  if (usersRes.error) {
    return { data: [], error: new Error(usersRes.error.message) };
  }

  const userById = new Map<string, UserRow>();
  for (const u of (usersRes.data ?? []) as UserRow[]) {
    userById.set(String(u.id), u);
  }

  const profileById = new Map<string, ProfileMatchRow>();
  for (const row of (profilesRes.data ?? []) as ProfileMatchRow[]) {
    profileById.set(String(row.id), row);
  }

  logFetchMatchingDrivers('3. parallel query results', {
    profiles: (profilesRes.data ?? []).map((p) => {
      const row = p as ProfileMatchRow;
      return {
        id: row.id,
        vehicle_type: row.vehicle_type,
        vehicle_class: row.vehicle_class,
        full_name: row.full_name,
      };
    }),
    users: (usersRes.data ?? []).map((u) => {
      const row = u as UserRow;
      return {
        id: row.id,
        role: row.role,
        is_verified: row.is_verified,
        is_hired_driver: row.is_hired_driver,
        is_guide_driver: row.is_guide_driver,
        city: row.city,
        languages: row.languages,
        full_name: row.full_name,
      };
    }),
    missingFromUsersDirectory: candidateDriverIds.filter((id) => !userById.has(id)),
  });

  const ratingByDriver = computeRatingAveragesFromRows(
    (ratingsRes.data ?? []) as { driver_id: string; overall: number }[],
  );

  const drivers: MatchingDriver[] = [];

  for (const driverId of candidateDriverIds) {
    const row = profileById.get(driverId) ?? {
      id: driverId,
      vehicle_type: null,
      vehicle_class: null,
      full_name: null,
      avatar_url: null,
    };
    const user = userById.get(driverId) ?? null;

    if (user?.role && user.role !== 'driver') {
      logDriverExclusion(exclusions, {
        driverId,
        step: '4. role check',
        detail: { role: user.role },
      });
      continue;
    }

    if (!driverEligibleForOpenJobBroadcast(user ?? {})) {
      logDriverExclusion(exclusions, {
        driverId,
        step: '5. open job broadcast (hired driver)',
        detail: { is_hired_driver: user?.is_hired_driver ?? null },
      });
      continue;
    }

    if (!driverMatchesRequestedCategory(user ?? {}, category)) {
      logDriverExclusion(exclusions, {
        driverId,
        step: '6. driver category',
        detail: {
          category,
          is_guide_driver: user?.is_guide_driver ?? null,
          is_hired_driver: user?.is_hired_driver ?? null,
        },
      });
      continue;
    }

    const driverLangs = user?.languages ?? [];
    if (!driverMatchesRequiredLanguages(driverLangs, requiredLanguages)) {
      logDriverExclusion(exclusions, {
        driverId,
        step: '7. required languages',
        detail: { driverLangs, requiredLanguages },
      });
      continue;
    }

    const driverCity = user?.city?.trim() ?? null;
    if (cityNorm && driverCity !== cityNorm) {
      logDriverExclusion(exclusions, {
        driverId,
        step: '8. city filter',
        detail: { driverCity, cityFilter: cityNorm },
      });
      continue;
    }

    const vehicle = vehicleByDriver.get(driverId) ?? null;
    if (!vehicle || !vehicleMatchesSelection(vehicle.type, vehicle.class, normType, normClass)) {
      logDriverExclusion(exclusions, {
        driverId,
        step: '9. vehicle row missing or mismatch',
        detail: {
          vehicle: vehicle
            ? { type: vehicle.type, class: vehicle.class, model: vehicle.model }
            : null,
        },
      });
      continue;
    }

    if (minPassengerCapacity != null && minPassengerCapacity > 0) {
      const cap =
        vehicle.passenger_capacity != null ? Number(vehicle.passenger_capacity) : null;
      // Unknown capacity (null) must not exclude — many legacy vehicles lack passenger_capacity.
      if (cap != null && cap < minPassengerCapacity) {
        logDriverExclusion(exclusions, {
          driverId,
          step: '10. min passenger capacity',
          detail: { cap, minPassengerCapacity },
        });
        continue;
      }
      if (cap == null && __DEV__) {
        logFetchMatchingDrivers(`10. min seats: ${driverId} kept (capacity unknown)`, {
          minPassengerCapacity,
        });
      }
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
            id: vehicle.id ?? null,
            type: vehicle.type ?? null,
            class: vehicle.class ?? null,
            model: vehicle.model ?? null,
            year: vehicle.year ?? null,
            color: vehicle.color ?? null,
            plate: vehicle.plate ?? null,
            passenger_capacity:
              vehicle.passenger_capacity != null ? Number(vehicle.passenger_capacity) : null,
            photo_front: firstVehiclePhotoUrl(vehicle),
          }
        : null,
    });
  }

  const sortMode = options?.sortMode === 'rating' ? 'rating' : 'name';
  const sortedDrivers = sortMatchingDrivers(drivers, sortMode);

  logFetchMatchingDrivers('done', {
    matchedCount: sortedDrivers.length,
    matchedIds: sortedDrivers.map((d) => d.id),
    sortMode,
    excludedCount: exclusions.length,
    exclusions,
  });

  return { data: sortedDrivers, error: null };
}

export async function fetchDriverProfile(
  driverUserId: string,
  options?: { bookingVehicleId?: string | null },
): Promise<{ data: DriverProfile | null; error: Error | null }> {
  const preferredId = options?.bookingVehicleId?.trim() || null;
  const [userRes, profileRes, vehiclesRes, ratingRes] = await Promise.all([
    supabase
      .from(USERS_DIRECTORY)
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
  const v =
    (preferredId ? vehicles.find((row) => row.id === preferredId) : null) ??
    vehicles.find((row) => row.is_active) ??
    vehicles[0] ??
    null;

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
