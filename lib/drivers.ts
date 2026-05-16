import { fetchDriverAverageRating } from './ratings';
import { supabase } from './supabase';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

export type DriverProfile = {
  user_id: string;
  full_name: string | null;
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
};

export type MatchingDriver = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  languages: string[];
  experience_years: number;
  rating: string | null;
  vehicle: {
    model: string | null;
    year: number | null;
    color: string | null;
    plate: string | null;
    photo_front: string | null;
  } | null;
};

/** Drivers whose `profiles` vehicle prefs match the booking selection. */
export async function fetchMatchingDrivers(
  vehicleType: string,
  vehicleClass: string,
): Promise<{ data: MatchingDriver[]; error: Error | null }> {
  const normType = normalizeVehicleType(vehicleType);
  const normClass = normalizeVehicleClass(vehicleClass);

  if (!normType || !normClass) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, vehicle_type, vehicle_class, push_token')
    .eq('vehicle_type', normType)
    .eq('vehicle_class', normClass);

  if (error) {
    return { data: [], error: new Error(error.message) };
  }
  if (!data?.length) {
    return { data: [], error: null };
  }

  const enriched = await Promise.all(
    data.map(async (row) => {
      const driverId = String((row as { id: string }).id);
      const [vehicleRes, ratingRes, userRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('model, year, color, plate, photo_front')
          .eq('driver_id', driverId)
          .limit(1)
          .maybeSingle(),
        fetchDriverAverageRating(driverId),
        supabase
          .from('users')
          .select('full_name, avatar_url, languages, experience_years, role')
          .eq('id', driverId)
          .maybeSingle(),
      ]);

      const user = userRes.data as {
        full_name?: string | null;
        avatar_url?: string | null;
        languages?: string[] | null;
        experience_years?: number | null;
        role?: string | null;
      } | null;

      if (user?.role && user.role !== 'driver') {
        return null;
      }

      const vehicle = vehicleRes.data as {
        model?: string | null;
        year?: number | null;
        color?: string | null;
        plate?: string | null;
        photo_front?: string | null;
      } | null;

      const avgRating =
        ratingRes.count > 0 ? ratingRes.average.toFixed(1) : null;

      return {
        id: driverId,
        full_name: user?.full_name?.trim() || null,
        avatar_url: user?.avatar_url ?? null,
        languages: user?.languages ?? [],
        experience_years: user?.experience_years ?? 0,
        rating: avgRating,
        vehicle: vehicle
          ? {
              model: vehicle.model ?? null,
              year: vehicle.year ?? null,
              color: vehicle.color ?? null,
              plate: vehicle.plate ?? null,
              photo_front: vehicle.photo_front ?? null,
            }
          : null,
      } satisfies MatchingDriver;
    }),
  );

  const drivers = enriched.filter((d): d is MatchingDriver => d != null);
  drivers.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ka'));

  return { data: drivers, error: null };
}

export async function fetchDriverProfile(
  driverClerkId: string,
): Promise<{ data: DriverProfile | null; error: Error | null }> {
  const [userRes, vehicleRes, ratingRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', driverClerkId).maybeSingle(),
    supabase.from('vehicles').select('*').eq('driver_id', driverClerkId).maybeSingle(),
    fetchDriverAverageRating(driverClerkId),
  ]);

  if (userRes.error) {
    return { data: null, error: new Error(userRes.error.message) };
  }

  const user = userRes.data as UserProfileRow | null;
  const v = vehicleRes.data as {
    photo_front?: string | null;
    type?: string | null;
    class?: string | null;
    model?: string | null;
    color?: string | null;
    year?: number | null;
    plate?: string | null;
  } | null;

  return {
    data: {
      user_id: driverClerkId,
      full_name: user?.full_name ?? null,
      avatar_url: user?.avatar_url ?? null,
      bio: user?.bio ?? null,
      languages: user?.languages ?? null,
      experience_years: user?.experience_years ?? null,
      vehicle: v
        ? {
            photo_front: v.photo_front ?? null,
            type: v.type ?? null,
            class: v.class ?? null,
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
