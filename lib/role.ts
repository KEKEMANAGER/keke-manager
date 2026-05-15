import type { KekeRole, Profile } from '../contexts/AuthContext';

export type { KekeRole };

/**
 * Returns the app role from `public.users` (Supabase profile).
 */
export function getUserRole(profile: Profile | null | undefined): KekeRole | null {
  if (!profile) return null;
  const r = profile.role;
  if (r === 'driver' || r === 'company' || r === 'admin') return r;
  return null;
}

export function hasCompleteRole(profile: Profile | null | undefined): boolean {
  return getUserRole(profile) !== null;
}
