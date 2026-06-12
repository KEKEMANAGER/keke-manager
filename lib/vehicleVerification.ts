import { storagePublicUrlBase, withCacheBust } from './mediaUpload';
import { supabase } from './supabase';
import type { VehicleRow } from './vehicles';

export type VehicleVerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export type VehicleTechPassportSlot = 'tech_passport_front' | 'tech_passport_back';

export const VEHICLE_TECH_PASSPORT_COLUMNS =
  'tech_passport_front, tech_passport_back, verification_status, rejection_reason';

export function vehicleTechPassportSlotUploaded(
  vehicle: Pick<VehicleRow, VehicleTechPassportSlot>,
  slot: VehicleTechPassportSlot,
): boolean {
  return !!vehicle[slot]?.trim();
}

export function vehicleTechPassportComplete(
  vehicle: Pick<VehicleRow, VehicleTechPassportSlot>,
): boolean {
  return (
    vehicleTechPassportSlotUploaded(vehicle, 'tech_passport_front') &&
    vehicleTechPassportSlotUploaded(vehicle, 'tech_passport_back')
  );
}

/** Vehicle has minimum metadata before admin review. */
export function vehicleRegistrationMetadataComplete(vehicle: VehicleRow): boolean {
  return !!(
    vehicle.type?.trim() &&
    vehicle.class?.trim() &&
    vehicle.plate?.trim() &&
    vehicle.passenger_capacity != null &&
    vehicle.passenger_capacity > 0
  );
}

export function vehicleCanSubmitForReview(vehicle: VehicleRow): boolean {
  return (
    vehicleRegistrationMetadataComplete(vehicle) &&
    vehicleTechPassportComplete(vehicle) &&
    (vehicle.verification_status === 'pending' ||
      vehicle.verification_status === 'rejected' ||
      vehicle.verification_status === 'submitted')
  );
}

export function vehicleIsApproved(vehicle: Pick<VehicleRow, 'is_verified' | 'verification_status'>): boolean {
  return vehicle.is_verified === true && vehicle.verification_status === 'approved';
}

export function vehicleCanActivate(vehicle: VehicleRow): boolean {
  return vehicleIsApproved(vehicle);
}

export async function saveVehicleTechPassportUrl(
  vehicleId: string,
  driverId: string,
  slot: VehicleTechPassportSlot,
  publicUrl: string,
): Promise<{ error: Error | null }> {
  const url = storagePublicUrlBase(publicUrl);
  const payload: Record<string, unknown> = {
    [slot]: url,
    updated_at: new Date().toISOString(),
  };

  const { data: current, error: readErr } = await supabase
    .from('vehicles')
    .select('verification_status')
    .eq('id', vehicleId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (readErr) return { error: new Error(readErr.message) };

  const status = (current?.verification_status ?? 'pending') as VehicleVerificationStatus;
  if (status === 'rejected') {
    payload.verification_status = 'pending';
    payload.rejection_reason = null;
    payload.is_verified = false;
  } else if (status === 'submitted' || status === 'approved') {
    payload.verification_status = 'submitted';
    payload.rejection_reason = null;
    payload.is_verified = false;
  }

  const { error } = await supabase
    .from('vehicles')
    .update(payload)
    .eq('id', vehicleId)
    .eq('driver_id', driverId);

  return { error: error ? new Error(error.message) : null };
}

export async function submitVehicleForVerification(
  vehicleId: string,
  driverId: string,
): Promise<{ error: Error | null }> {
  const { data: row, error: readErr } = await supabase
    .from('vehicles')
    .select(
      'id, type, class, plate, passenger_capacity, tech_passport_front, tech_passport_back, verification_status',
    )
    .eq('id', vehicleId)
    .eq('driver_id', driverId)
    .maybeSingle();

  if (readErr) return { error: new Error(readErr.message) };
  if (!row) return { error: new Error('მანქანა ვერ მოიძებნა') };

  const vehicle = row as VehicleRow;
  if (!vehicleCanSubmitForReview(vehicle)) {
    return { error: new Error('შეავსეთ მონაცემები და ატვირთეთ ტექპასპორტის ორივე მხარე') };
  }

  const { error } = await supabase
    .from('vehicles')
    .update({
      verification_status: 'submitted',
      rejection_reason: null,
      is_verified: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vehicleId)
    .eq('driver_id', driverId);

  return { error: error ? new Error(error.message) : null };
}

export type AdminVehicleVerificationRow = VehicleRow & {
  driver_name: string | null;
  driver_email: string | null;
};

const ADMIN_VEHICLE_SELECT = `id, driver_id, is_active, photo_front, photo_left, photo_right, photo_interior, photo_rear, type, class, model, color, year, plate, make_id, model_id, passenger_capacity, is_verified, verification_status, rejection_reason, tech_passport_front, tech_passport_back, updated_at`;

function bustUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return withCacheBust(url.trim()) ?? url.trim();
}

export async function fetchAdminVehicleVerificationQueue(): Promise<{
  data: AdminVehicleVerificationRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(ADMIN_VEHICLE_SELECT)
    .eq('verification_status', 'submitted')
    .order('updated_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };

  const vehicles = (data ?? []) as VehicleRow[];
  const driverIds = [...new Set(vehicles.map((v) => v.driver_id))];

  let usersById = new Map<string, { full_name: string | null; email: string | null }>();
  if (driverIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', driverIds);
    for (const u of users ?? []) {
      const row = u as { id: string; full_name: string | null; email: string | null };
      usersById.set(row.id, { full_name: row.full_name, email: row.email });
    }
  }

  return {
    data: vehicles.map((v) => {
      const u = usersById.get(v.driver_id);
      return {
        ...v,
        tech_passport_front: bustUrl(v.tech_passport_front),
        tech_passport_back: bustUrl(v.tech_passport_back),
        photo_front: bustUrl(v.photo_front),
        photo_left: bustUrl(v.photo_left),
        photo_right: bustUrl(v.photo_right),
        photo_interior: bustUrl(v.photo_interior),
        photo_rear: bustUrl(v.photo_rear),
        driver_name: u?.full_name ?? null,
        driver_email: u?.email ?? null,
      };
    }),
    error: null,
  };
}

export async function approveVehicleVerification(
  vehicleId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({
      is_verified: true,
      verification_status: 'approved',
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vehicleId);

  return { error: error ? new Error(error.message) : null };
}

export async function rejectVehicleVerification(
  vehicleId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({
      is_verified: false,
      verification_status: 'rejected',
      rejection_reason: reason.trim(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vehicleId);

  return { error: error ? new Error(error.message) : null };
}
