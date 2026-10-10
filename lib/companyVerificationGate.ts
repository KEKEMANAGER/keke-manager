import type { Profile } from '../contexts/AuthContext';
import { getUserRole } from './role';

export type CompanyVerificationGateMode = 'full' | 'pending' | 'rejected';

/** The two columns that decide whether a company is in. */
export type CompanyApprovalFields = {
  verification_status?: string | null;
  is_verified?: boolean | null;
};

/**
 * Approved means the admin said so.
 *
 * `is_verified` is a privileged column — a trigger on `public.users` refuses
 * any change to it that does not come from an admin or the service role — and
 * since the migration that added this gate, `verification_status` can only be
 * self-set to 'pending' or 'submitted'. Only an admin can write 'approved'.
 * That is what makes reading either field here safe.
 *
 * It stays an OR rather than the driver rule's AND so that a half-written
 * approval (the panel writes `users` and `profiles` in two statements) cannot
 * lock a paying company out of its own account. The same predicate decides
 * what the database lets through (`company_can_create_bookings()`) and which
 * companies the admin queue shows, so a company can never be let into the app
 * and then refused by the server, or be gated and invisible to the admin.
 */
export function companyRowIsApproved(row: CompanyApprovalFields): boolean {
  const status = row.verification_status?.trim().toLowerCase() ?? '';
  return status === 'approved' || row.is_verified === true;
}

/**
 * A company waits at the door exactly like a driver does.
 *
 * Until now a company that signed up walked straight into the dashboard and
 * could send bookings to real drivers before anyone had looked at who they
 * were. `public.users` already defaults a new row to `verification_status
 * 'pending'`; nothing in the app ever read it for companies. This is the read.
 */
export function getCompanyVerificationGateMode(
  profile: Profile | null,
): CompanyVerificationGateMode {
  // Only a company is gated here. Admins share the (app) group — gating one
  // would mean an unapproved admin could never reach the panel that approves.
  // A profile that has not loaded, or has no role yet, is left to the routing
  // it had before this gate existed rather than being locked out by a failed
  // fetch.
  if (getUserRole(profile) !== 'company') return 'full';

  if (companyRowIsApproved(profile ?? {})) return 'full';

  return profile?.verification_status?.trim().toLowerCase() === 'rejected'
    ? 'rejected'
    : 'pending';
}

export function companyHasFullAppAccess(profile: Profile | null): boolean {
  return getCompanyVerificationGateMode(profile) === 'full';
}

/** True for a company (not an admin) still waiting for, or refused, approval. */
export function companyAwaitingApproval(profile: Profile | null): boolean {
  return !companyHasFullAppAccess(profile);
}
