import { fetchDriverAverageRating } from './ratings';
import { supabase } from './supabase';

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
