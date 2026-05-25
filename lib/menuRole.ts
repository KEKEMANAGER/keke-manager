import type { Profile } from '../contexts/AuthContext';

/** App drawer / navigation role (not stored in DB). */
export type AppMenuRole = 'company' | 'freelance_driver' | 'hired_driver';

export function resolveAppMenuRole(profile: Profile | null | undefined): AppMenuRole | null {
  if (!profile?.role) return null;
  if (profile.role === 'company' || profile.role === 'admin') return 'company';
  if (profile.role === 'driver') {
    return profile.is_hired_driver === true ? 'hired_driver' : 'freelance_driver';
  }
  return null;
}

export function isFreelanceDriver(profile: Profile | null | undefined): boolean {
  return resolveAppMenuRole(profile) === 'freelance_driver';
}

export function isHostDriver(vehicleCount: number): boolean {
  return vehicleCount >= 2;
}
