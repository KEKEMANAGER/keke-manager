import { storagePublicUrlBase, withCacheBust } from './mediaUpload';
import { supabase } from './supabase';
import type { VehicleRow } from './vehicles';

function strField(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

export type VehicleVerificationStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export type VehicleTechPassportSlot = 'tech_passport_front' | 'tech_passport_back';

export const VEHICLE_TECH_PASSPORT_COLUMNS =
  'tech_passport_front, tech_passport_back, verification_status, rejection_reason';

export function vehicleTechPassportSlotUploaded(
  vehicle: Pick<VehicleRow, VehicleTechPassportSlot>,
  slot: VehicleTechPassportSlot,
): boolean {
  return !!strField(vehicle[slot]);
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
    strField(vehicle.type) &&
    strField(vehicle.class) &&
    strField(vehicle.plate) &&
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

async function approvedOwnerIdsForVehicleQueue(): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('verification_status', 'approved')
    .eq('is_verified', true);

  if (error) return [];
  return (data ?? []).map((row) => String((row as { id: string }).id));
}

export async function fetchAdminVehicleVerificationQueueCount(): Promise<number> {
  const ownerIds = await approvedOwnerIdsForVehicleQueue();
  if (ownerIds.length === 0) return 0;

  const { count, error } = await supabase
    .from('vehicles')
    .select('*', { count: 'exact', head: true })
    .eq('verification_status', 'submitted')
    .in('driver_id', ownerIds);

  if (error) return 0;
  return count ?? 0;
}

export async function fetchAdminVehicleVerificationQueue(): Promise<{
  data: AdminVehicleVerificationRow[];
  error: Error | null;
}> {
  const ownerIds = await approvedOwnerIdsForVehicleQueue();
  if (ownerIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('vehicles')
    .select(ADMIN_VEHICLE_SELECT)
    .eq('verification_status', 'submitted')
    .in('driver_id', ownerIds)
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
  const id = vehicleId.trim();
  if (!id) return { error: new Error('vehicle id missing') };

  const { data: rpcOk, error: rpcErr } = await supabase.rpc('admin_approve_vehicle_verification', {
    p_vehicle_id: id,
  });

  if (!rpcErr) {
    if (rpcOk === true) return { error: null };
    return { error: new Error('Vehicle not found or not awaiting review') };
  }

  const rpcMissing =
    rpcErr.code === 'PGRST202' ||
    /could not find the function/i.test(rpcErr.message ?? '');

  if (!rpcMissing) {
    return { error: new Error(rpcErr.message) };
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update({
      is_verified: true,
      verification_status: 'approved',
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('verification_status', 'submitted')
    .select('id');

  if (error) return { error: new Error(error.message) };
  if (!data?.length) {
    return { error: new Error('Vehicle not found or permission denied') };
  }
  return { error: null };
}

export async function rejectVehicleVerification(
  vehicleId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const id = vehicleId.trim();
  const trimmedReason = reason.trim();
  if (!id) return { error: new Error('vehicle id missing') };
  if (!trimmedReason) return { error: new Error('rejection reason required') };

  const { data: rpcOk, error: rpcErr } = await supabase.rpc('admin_reject_vehicle_verification', {
    p_vehicle_id: id,
    p_reason: trimmedReason,
  });

  if (!rpcErr) {
    if (rpcOk === true) return { error: null };
    return { error: new Error('Vehicle not found or not awaiting review') };
  }

  const rpcMissing =
    rpcErr.code === 'PGRST202' ||
    /could not find the function/i.test(rpcErr.message ?? '');

  if (!rpcMissing) {
    return { error: new Error(rpcErr.message) };
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update({
      is_verified: false,
      verification_status: 'rejected',
      rejection_reason: trimmedReason,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('verification_status', 'submitted')
    .select('id');

  if (error) return { error: new Error(error.message) };
  if (!data?.length) {
    return { error: new Error('Vehicle not found or permission denied') };
  }
  return { error: null };
}
