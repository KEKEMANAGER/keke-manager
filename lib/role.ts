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

/** Hired driver registered without own vehicle (see `users.is_hired_driver`). */
export function isHiredDriver(profile: Profile | null | undefined): boolean {
  return profile?.is_hired_driver === true;
}

export {
  resolveAppMenuRole,
  isFreelanceDriver,
  isHostDriver,
  type AppMenuRole,
} from './menuRole';
