import type { KekeRole } from '../contexts/AuthContext';
import { withCacheBust } from './mediaUpload';
import { supabase } from './supabase';
import { fetchVehicleByDriver, type VehicleRow } from './vehicles';

export type AdminVerificationUser = {
  id: string;
  full_name: string | null;
  role: KekeRole | string | null;
  email: string | null;
  verification_status: string | null;
  license_photo: string | null;
  id_photo: string | null;
  vehicle_registration_photo: string | null;
  vehicle: VehicleRow | null;
};

const USER_SELECT =
  'id, full_name, role, email, license_photo, id_photo, vehicle_registration_photo, verification_status';

/** Users awaiting admin review (drivers who submitted, or still pending with docs). */
export async function fetchAdminVerificationQueue(): Promise<{
  data: AdminVerificationUser[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .in('verification_status', ['pending', 'submitted'])
    .order('full_name', { ascending: true });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const users = (data ?? []) as Omit<AdminVerificationUser, 'vehicle'>[];

  const withVehicle = await Promise.all(
    users.map(async (u) => {
      let vehicle: VehicleRow | null = null;
      if (u.role === 'driver') {
        const { data: v } = await fetchVehicleByDriver(u.id);
        vehicle = v;
      }
      return {
        ...u,
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

function bustUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return withCacheBust(url.trim()) ?? url.trim();
}

export async function approveUserVerification(userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('users')
    .update({
      is_verified: true,
      verification_status: 'approved',
      rejection_reason: null,
    })
    .eq('id', userId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function rejectUserVerification(
  userId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('users')
    .update({
      is_verified: false,
      verification_status: 'rejected',
      rejection_reason: reason.trim(),
    })
    .eq('id', userId);

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export type AdminDocumentKey =
  | 'license'
  | 'id'
  | 'vehicle_reg'
  | 'vehicle_front'
  | 'vehicle_left'
  | 'vehicle_right'
  | 'vehicle_interior'
  | 'vehicle_rear';

export function documentUrlFor(
  user: AdminVerificationUser,
  key: AdminDocumentKey,
): string | null {
  switch (key) {
    case 'license':
      return user.license_photo;
    case 'id':
      return user.id_photo;
    case 'vehicle_reg':
      return user.vehicle_registration_photo;
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
