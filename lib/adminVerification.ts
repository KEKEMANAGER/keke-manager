import type { KekeRole } from '../contexts/AuthContext';
import { companyRowIsApproved, type CompanyApprovalFields } from './companyVerificationGate';
import { withCacheBust } from './mediaUpload';
import { supabase } from './supabase';
import {
  DRIVER_KYC_DOC_SLOTS,
  VERIFICATION_DOC_COLUMNS,
  type VerificationDocSlot,
} from './verificationDocs';
import { fetchVehicleByDriver, type VehicleRow } from './vehicles';

export type AdminVerificationUser = {
  id: string;
  full_name: string | null;
  role: KekeRole | string | null;
  email: string | null;
  is_hired_driver: boolean | null;
  verification_status: string | null;
  license_front: string | null;
  license_back: string | null;
  tech_passport_front: string | null;
  tech_passport_back: string | null;
  id_front: string | null;
  id_back: string | null;
  license_photo: string | null;
  id_photo: string | null;
  vehicle_registration_photo: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_id_code: string | null;
  company_director: string | null;
  created_at: string | null;
  is_verified: boolean | null;
  vehicle: VehicleRow | null;
};

const USER_SELECT = `id, full_name, role, email, is_hired_driver, company_email, company_phone, company_id_code, company_director, created_at, ${VERIFICATION_DOC_COLUMNS}, license_photo, id_photo, vehicle_registration_photo, verification_status, is_verified`;

/**
 * Which half of the queue to show.
 *
 * Drivers and companies used to arrive in one list, which made a company
 * registration easy to lose among thirty drivers — and a company now cannot
 * work at all until it is approved, so it must not be the row that gets
 * scrolled past.
 */
export type AdminVerificationQueueRole = 'driver' | 'company';

type QueueOptions = { role?: AdminVerificationQueueRole };

/**
 * Narrows the query to one side of the split.
 *
 * Two different questions, so two different filters:
 *
 * - Companies: every company that cannot get into the app. Not "pending or
 *   submitted" — a company whose status is 'rejected', NULL or anything else
 *   is equally shut out, and if the queue did not show it there would be no
 *   screen anywhere that could let it back in. The queue is deliberately the
 *   exact complement of `companyRowIsApproved`; the status filter here only
 *   keeps the query bounded, and the real predicate runs in
 *   `filterQueueRows` below.
 * - Drivers: "everything that is not a company", rather than role = driver on
 *   the nose. A signup interrupted before the role was written leaves a row
 *   with no role at all, and when the queue was one list those still showed
 *   up. Matching 'driver' exactly would make them invisible in both tabs — an
 *   account nobody can see is an account nobody can approve.
 */
/**
 * Just the three filter methods used below, each returning the same builder.
 * The two call sites hand in differently-typed builders (rows vs a head
 * count), so the chain is typed through this shape and cast back once.
 */
type RoleFilterable = {
  eq: (column: string, value: string) => RoleFilterable;
  in: (column: string, values: string[]) => RoleFilterable;
  or: (filter: string) => RoleFilterable;
};

function applyRoleFilter<T>(query: T, role: AdminVerificationQueueRole | undefined): T {
  const q = query as unknown as RoleFilterable;

  const filtered =
    role === 'company'
      ? q.eq('role', 'company').or('verification_status.is.null,verification_status.neq.approved')
      : role === 'driver'
        ? q.in('verification_status', ['pending', 'submitted']).or('role.is.null,role.neq.company')
        : q.in('verification_status', ['pending', 'submitted']);

  return filtered as unknown as T;
}

/** The half of the company filter PostgREST cannot express. */
function filterQueueRows<T extends { role?: string | null } & CompanyApprovalFields>(
  rows: T[],
  role: AdminVerificationQueueRole | undefined,
): T[] {
  if (role !== 'company') return rows;
  return rows.filter((row) => !companyRowIsApproved(row));
}

/** Users awaiting admin review (drivers who submitted, or still pending with docs). */
export async function fetchAdminVerificationQueue(options: QueueOptions = {}): Promise<{
  data: AdminVerificationUser[];
  error: Error | null;
}> {
  const query = applyRoleFilter(supabase.from('users').select(USER_SELECT), options.role);

  // Companies are read oldest first: whoever has been waiting longest is at
  // the top, because every day in this queue is a day they cannot work.
  const { data, error } =
    options.role === 'company'
      ? await query.order('created_at', { ascending: true })
      : await query.order('full_name', { ascending: true });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const users = filterQueueRows(
    (data ?? []) as Omit<AdminVerificationUser, 'vehicle'>[],
    options.role,
  );

  const withVehicle = await Promise.all(
    users.map(async (u) => {
      let vehicle: VehicleRow | null = null;
      if (u.role === 'driver' && !u.is_hired_driver) {
        const { data: v } = await fetchVehicleByDriver(u.id);
        vehicle = v;
      }
      return {
        ...u,
        license_front: bustUrl(u.license_front ?? u.license_photo),
        license_back: bustUrl(u.license_back),
        tech_passport_front: bustUrl(u.tech_passport_front ?? u.vehicle_registration_photo),
        tech_passport_back: bustUrl(u.tech_passport_back),
        id_front: bustUrl(u.id_front ?? u.id_photo),
        id_back: bustUrl(u.id_back),
        license_photo: bustUrl(u.license_photo),
        id_photo: bustUrl(u.id_photo),
        vehicle_registration_photo: bustUrl(u.vehicle_registration_photo),
        vehicle: vehicle
          ? {
              ...vehicle,
              photo_front: bustUrl(vehicle.photo_front),
              photo_left: bustUrl(vehicle.photo_left),
              photo_right: bustUrl(vehicle.photo_right),
              photo_interior: bustUrl(vehicle.photo_interior),
              photo_rear: bustUrl(vehicle.photo_rear),
            }
          : null,
      } satisfies AdminVerificationUser;
    }),
  );

  return { data: withVehicle, error: null };
}

/** Pending KYC count for admin verify badge. */
export async function fetchAdminVerificationQueueCount(
  options: QueueOptions = {},
): Promise<number> {
  // The company count needs the `is_verified` half of the predicate, which
  // only runs in JS, so it counts rows rather than asking Postgres for a
  // number that would be wrong. There are a handful of companies; this is
  // cheap, and a badge that disagrees with the list is worse than a second
  // round trip.
  if (options.role === 'company') {
    const query = applyRoleFilter(
      supabase.from('users').select('verification_status, is_verified, role'),
      'company',
    );
    const { data, error } = await query;
    if (error) return 0;
    return filterQueueRows(
      (data ?? []) as ({ role?: string | null } & CompanyApprovalFields)[],
      'company',
    ).length;
  }

  const query = applyRoleFilter(
    supabase.from('users').select('*', { count: 'exact', head: true }),
    options.role,
  );

  const { count, error } = await query;

  if (error) return 0;
  return count ?? 0;
}

function bustUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return withCacheBust(url.trim()) ?? url.trim();
}

export async function approveUserVerification(userId: string): Promise<{ error: Error | null }> {
  const [usersRes, profilesRes] = await Promise.all([
    supabase
      .from('users')
      .update({
        is_verified: true,
        verification_status: 'approved',
        rejection_reason: null,
      })
      .eq('id', userId),
    supabase.from('profiles').update({ is_verified: true }).eq('id', userId),
  ]);

  if (usersRes.error) return { error: new Error(usersRes.error.message) };
  if (profilesRes.error) return { error: new Error(profilesRes.error.message) };
  return { error: null };
}

export async function rejectUserVerification(
  userId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const [usersRes, profilesRes] = await Promise.all([
    supabase
      .from('users')
      .update({
        is_verified: false,
        verification_status: 'rejected',
        rejection_reason: reason.trim(),
      })
      .eq('id', userId),
    supabase.from('profiles').update({ is_verified: false }).eq('id', userId),
  ]);

  if (usersRes.error) return { error: new Error(usersRes.error.message) };
  if (profilesRes.error) return { error: new Error(profilesRes.error.message) };
  return { error: null };
}

export type AdminDocumentKey =
  | VerificationDocSlot
  | 'vehicle_front'
  | 'vehicle_left'
  | 'vehicle_right'
  | 'vehicle_interior'
  | 'vehicle_rear';

export function verificationDocSlotsForAdmin(_user: AdminVerificationUser): VerificationDocSlot[] {
  return DRIVER_KYC_DOC_SLOTS;
}

export function documentUrlFor(
  user: AdminVerificationUser,
  key: AdminDocumentKey,
): string | null {
  switch (key) {
    case 'license_front':
      return user.license_front;
    case 'license_back':
      return user.license_back;
    case 'tech_passport_front':
      return user.tech_passport_front;
    case 'tech_passport_back':
      return user.tech_passport_back;
    case 'id_front':
      return user.id_front;
    case 'id_back':
      return user.id_back;
    case 'vehicle_front':
      return user.vehicle?.photo_front ?? null;
    case 'vehicle_left':
      return user.vehicle?.photo_left ?? null;
    case 'vehicle_right':
      return user.vehicle?.photo_right ?? null;
    case 'vehicle_interior':
      return user.vehicle?.photo_interior ?? null;
    case 'vehicle_rear':
      return user.vehicle?.photo_rear ?? null;
    default:
      return null;
  }
}
