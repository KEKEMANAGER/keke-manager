import type { KekeRole, Profile } from '../contexts/AuthContext';

export type { KekeRole };

/** `public.users` row shape — not a Clerk user. */
function isProfileRow(source: object): source is Profile {
  return 'full_name' in source && 'role' in source && 'id' in source;
}

/**
 * Returns the app role from `public.users` (Supabase profile).
 *
 * Stage 2: When Clerk is removed from `sign-up.tsx`, delete the legacy branch below.
 */
export function getUserRole(
  source: Profile | { unsafeMetadata?: unknown; publicMetadata?: unknown } | null | undefined,
): KekeRole | null {
  if (!source) return null;
  if (typeof source === 'object' && isProfileRow(source)) {
    const r = source.role;
    if (r === 'driver' || r === 'company' || r === 'admin') return r;
    return null;
  }
  const unsafe = (source as { unsafeMetadata?: { role?: string } }).unsafeMetadata;
  const pub = (source as { publicMetadata?: { role?: string } }).publicMetadata;
  const r = unsafe?.role ?? pub?.role;
  if (r === 'driver' || r === 'company' || r === 'admin') return r;
  return null;
}

export function hasCompleteRole(
  source: Profile | { unsafeMetadata?: unknown; publicMetadata?: unknown } | null | undefined,
): boolean {
  return getUserRole(source) !== null;
}
