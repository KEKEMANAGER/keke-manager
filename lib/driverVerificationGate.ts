import type { Profile } from '../contexts/AuthContext';

export type DriverVerificationGateMode = 'full' | 'pending' | 'submitted' | 'rejected';

/** Drivers with approved KYC + verified flag get full app access. */
export function getDriverVerificationGateMode(profile: Profile | null): DriverVerificationGateMode {
  if (
    profile?.verification_status === 'approved' &&
    profile?.is_verified === true
  ) {
    return 'full';
  }

  const status = profile?.verification_status?.trim() || 'pending';
  if (status === 'rejected') return 'rejected';
  if (status === 'submitted') return 'submitted';
  return 'pending';
}

export function driverHasFullAppAccess(profile: Profile | null): boolean {
  return getDriverVerificationGateMode(profile) === 'full';
}

export function isDriverVerificationRoute(segments: string[]): boolean {
  return segments.includes('verification');
}
