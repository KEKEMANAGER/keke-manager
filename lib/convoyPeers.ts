import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import { trimUserId } from './userId';
import { vehicleClassLabel, vehicleTypeLabel } from './vehicleCatalog';

export type ConvoyPeerLeg = {
  legBookingId: string;
  legIndex: number;
  vehicleType: string | null;
  vehicleClass: string | null;
  vehicleTypeLabel: string | null;
  vehicleClassLabel: string | null;
  passengers: number;
  driverId: string | null;
  driverName: string | null;
  legStatus: string | null;
  /** Set only for company (all legs) or the viewer's own leg. */
  priceGel: number | null;
  isOwnLeg: boolean;
};

type RpcRow = {
  leg_booking_id: string;
  leg_index: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  passengers: number | null;
  driver_id: string | null;
  leg_status: string | null;
  price_gel: number | null;
};

export async function fetchConvoyPeerLegs(
  masterBookingId: string,
  viewerUserId: string,
): Promise<{ data: ConvoyPeerLeg[]; error: Error | null }> {
  const masterId = String(masterBookingId ?? '').trim();
  const viewerId = trimUserId(viewerUserId);
  if (!masterId || !viewerId) {
    return { data: [], error: new Error('master id and viewer required') };
  }

  const { data, error } = await supabase.rpc('fetch_convoy_legs_for_participant', {
    p_master_id: masterId,
  });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const rows = (data ?? []) as RpcRow[];
  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const driverIds = [
    ...new Set(rows.map((r) => trimUserId(r.driver_id)).filter(Boolean)),
  ] as string[];

  const nameMap = new Map<string, string | null>();
  if (driverIds.length > 0) {
    const { data: users } = await supabase
      .from(USERS_DIRECTORY)
      .select('id, full_name')
      .in('id', driverIds);
    for (const u of users ?? []) {
      const row = u as { id: string; full_name?: string | null };
      nameMap.set(row.id, row.full_name?.trim() || null);
    }
  }

  const out: ConvoyPeerLeg[] = rows.map((row, i) => {
    const driverId = trimUserId(row.driver_id);
    const typeCode = row.vehicle_type?.trim() || null;
    const classCode = row.vehicle_class?.trim() || null;
    return {
      legBookingId: row.leg_booking_id,
      legIndex: row.leg_index && row.leg_index > 0 ? row.leg_index : i + 1,
      vehicleType: typeCode,
      vehicleClass: classCode,
      vehicleTypeLabel: typeCode ? vehicleTypeLabel(typeCode) : null,
      vehicleClassLabel: classCode ? vehicleClassLabel(classCode) : null,
      passengers: Math.max(1, Number(row.passengers) || 1),
      driverId: driverId || null,
      driverName: driverId ? nameMap.get(driverId) ?? null : null,
      legStatus: row.leg_status?.trim() || null,
      priceGel: row.price_gel != null ? Number(row.price_gel) : null,
      isOwnLeg: !!driverId && driverId === viewerId,
    };
  });

  return { data: out, error: null };
}
