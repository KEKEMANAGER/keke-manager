import {
  enrichBookingsForList,
  fetchBookingById,
  insertBooking,
  type BookingRow,
  type InsertBookingInput,
} from './bookings';
import { formatTourBookingNotificationBody } from './tourDays';
import { notifyBookingVoucherCreated, notifyMatchingDriversOfNewBooking } from './notifications';
import { resolveVehicleIdForBooking } from './bookingVehicle';
import { supabase } from './supabase';
import { trimUserId } from './userId';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

export type GroupConvoyLegPlan = {
  legIndex: number;
  passengers: number;
  vehicle_type: VehicleTypeCode;
  vehicle_class: VehicleClassCode;
  driver_id?: string | null;
  price_gel?: number;
};

export type GroupConvoyLegSummary = {
  totalLegs: number;
  assignedLegs: number;
  pendingLegs: number;
  inProgressLegs: number;
  completedLegs: number;
};

export function generateGroupCode(): string {
  return `GRP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Split total passengers across N legs as evenly as possible. */
export function splitPassengersEvenly(total: number, legCount: number): number[] {
  const n = Math.max(1, Math.floor(legCount));
  const pax = Math.max(1, Math.floor(total));
  const base = Math.floor(pax / n);
  let rem = pax % n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem--;
  }
  return out;
}

/** Derive leg count from per-vehicle capacity. */
export function splitPassengersByCapacity(total: number, capacity: number): number[] {
  const cap = Math.max(1, Math.floor(capacity));
  const pax = Math.max(1, Math.floor(total));
  const legCount = Math.ceil(pax / cap);
  return splitPassengersEvenly(pax, legCount);
}

export function summarizeLegs(legs: BookingRow[]): GroupConvoyLegSummary {
  let assignedLegs = 0;
  let pendingLegs = 0;
  let inProgressLegs = 0;
  let completedLegs = 0;
  for (const leg of legs) {
    if (leg.driver_id) assignedLegs++;
    if (leg.status === 'pending') pendingLegs++;
    else if (leg.status === 'in_progress') inProgressLegs++;
    else if (leg.status === 'completed') completedLegs++;
  }
  return {
    totalLegs: legs.length,
    assignedLegs,
    pendingLegs,
    inProgressLegs,
    completedLegs,
  };
}

export async function fetchLegsForMaster(
  masterBookingId: string,
  companyUserId?: string,
): Promise<{ data: BookingRow[]; error: Error | null }> {
  const masterId = String(masterBookingId ?? '').trim();
  if (!masterId) {
    return { data: [], error: new Error('master id required') };
  }
  let query = supabase
    .from('bookings')
    .select('*')
    .eq('parent_booking_id', masterId)
    .order('leg_index', { ascending: true });
  const companyId = trimUserId(companyUserId);
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query;
  if (error) {
    return { data: [], error: new Error(error.message) };
  }
  const rows = (data ?? []) as BookingRow[];
  return { data: await enrichBookingsForList(rows), error: null };
}

function legComment(master: BookingRow, legIndex: number, totalLegs: number): string {
  const code = master.group_code?.trim() || 'GRP';
  const base = master.comment?.trim() || '';
  const tag = `[Convoy ${code} · leg ${legIndex}/${totalLegs}]`;
  return base ? `${tag} ${base}` : tag;
}

function proportionalPrice(total: number, legPax: number, totalPax: number): number {
  if (totalPax <= 0) return total;
  return Math.round((total * legPax) / totalPax);
}

function masterToLegInsert(
  master: InsertBookingInput,
  masterRow: BookingRow,
  groupCode: string,
  leg: GroupConvoyLegPlan,
  totalLegs: number,
): InsertBookingInput {
  const totalPax = master.passengers;
  const price =
    leg.price_gel ??
    proportionalPrice(master.price_gel, leg.passengers, totalPax);
  return {
    ...master,
    passengers: leg.passengers,
    vehicle_type: leg.vehicle_type,
    vehicle_class: leg.vehicle_class,
    driver_id: leg.driver_id ?? null,
    price_gel: price,
    parent_booking_id: masterRow.id,
    leg_index: leg.legIndex,
    group_code: groupCode,
    is_group_master: false,
    skip_driver_notifications: false,
    comment: legComment(masterRow, leg.legIndex, totalLegs),
    voucher_code: `${groupCode}-L${leg.legIndex}`,
  };
}

export async function createGroupConvoy(
  master: InsertBookingInput,
  legs: GroupConvoyLegPlan[],
): Promise<{ masterId?: string; legIds: string[]; error: Error | null }> {
  if (legs.length === 0) {
    return { legIds: [], error: new Error('At least one leg is required') };
  }
  const groupCode = generateGroupCode();
  const firstLeg = legs[0];
  const masterInput: InsertBookingInput = {
    ...master,
    is_group_master: true,
    group_code: groupCode,
    skip_driver_notifications: true,
    driver_id: null,
    vehicle_type: firstLeg.vehicle_type,
    vehicle_class: firstLeg.vehicle_class,
    comment: master.comment?.trim()
      ? `[Convoy ${groupCode}] ${master.comment.trim()}`
      : `[Convoy ${groupCode}] Group tour · ${legs.length} vehicles`,
  };

  const { id: masterId, error: masterErr } = await insertBooking(masterInput);
  if (masterErr || !masterId) {
    return { legIds: [], error: masterErr ?? new Error('master insert failed') };
  }

  const { data: masterRow, error: fetchErr } = await fetchBookingById(masterId, master.company_id);
  if (fetchErr || !masterRow) {
    return { masterId, legIds: [], error: fetchErr ?? new Error('master row not found') };
  }

  const legIds: string[] = [];
  for (const leg of legs) {
    const legInput = masterToLegInsert(master, masterRow, groupCode, leg, legs.length);
    const { id: legId, error: legErr } = await insertBooking(legInput);
    if (legErr || !legId) {
      return { masterId, legIds, error: legErr ?? new Error(`leg ${leg.legIndex} insert failed`) };
    }
    legIds.push(legId);
  }

  return { masterId, legIds, error: null };
}

export async function assignDriverToLeg(
  legBookingId: string,
  companyUserId: string,
  driverUserId: string,
): Promise<{ ok: boolean; error: Error | null }> {
  const legId = String(legBookingId ?? '').trim();
  const companyId = trimUserId(companyUserId);
  const driverId = trimUserId(driverUserId);
  if (!legId || !companyId || !driverId) {
    return { ok: false, error: new Error('invalid ids') };
  }

  const { data: leg, error: legErr } = await fetchBookingById(legId, companyId);
  if (legErr || !leg) {
    return { ok: false, error: legErr ?? new Error('leg not found') };
  }
  if (leg.is_group_master || !leg.parent_booking_id) {
    return { ok: false, error: new Error('not a convoy leg') };
  }
  if (leg.status !== 'pending') {
    return { ok: false, error: new Error('leg is not pending') };
  }

  const vehicleType = normalizeVehicleType(leg.vehicle_type ?? '');
  const vehicleClass = normalizeVehicleClass(leg.vehicle_class ?? '');
  const vehicleId = await resolveVehicleIdForBooking({
    driverId,
    vehicleType,
    vehicleClass,
  });

  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      driver_id: driverId,
      vehicle_id: vehicleId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', legId)
    .eq('company_id', companyId)
    .eq('status', 'pending');

  if (updErr) {
    return { ok: false, error: new Error(updErr.message) };
  }

  void notifyBookingVoucherCreated({
    bookingId: legId,
    driverUserId: driverId,
    companyUserId: companyId,
    voucherCode: leg.voucher_code ?? undefined,
    kind: leg.kind,
    route: leg.route,
    from_location: leg.from_location,
    to_location: leg.to_location,
    tour_days: leg.tour_days,
    transfer_in: leg.transfer_in,
    transfer_out: leg.transfer_out,
  });

  return { ok: true, error: null };
}

export async function broadcastOpenLegs(
  masterBookingId: string,
  companyUserId: string,
): Promise<{ count: number; error: Error | null }> {
  const { data: legs, error } = await fetchLegsForMaster(masterBookingId, companyUserId);
  if (error) return { count: 0, error };

  let count = 0;
  for (const leg of legs) {
    if (leg.driver_id || leg.status !== 'pending') continue;
    const vehicleType = normalizeVehicleType(leg.vehicle_type ?? '');
    const vehicleClass = normalizeVehicleClass(leg.vehicle_class ?? '');
    if (!vehicleType) continue;
    void notifyMatchingDriversOfNewBooking({
      kind: leg.kind,
      vehicleType,
      vehicleClass: vehicleClass ?? undefined,
      bookingId: leg.id,
      showAlertIfEmpty: false,
      requiredLanguages: undefined,
      requestedDriverCategory: 'all',
      detailBody:
        leg.kind === 'tour'
          ? formatTourBookingNotificationBody({
              tour_days: leg.tour_days,
              transfer_in: leg.transfer_in,
              transfer_out: leg.transfer_out,
            })
          : undefined,
      availability: {
        kind: leg.kind,
        date_display: leg.date_display,
        itinerary: leg.itinerary,
        tour_days: leg.tour_days,
        transfer_in: leg.transfer_in,
        transfer_out: leg.transfer_out,
      },
    });
    count++;
  }
  return { count, error: null };
}
