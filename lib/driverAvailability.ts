import { isBookingRowUuid } from './bookings';
import type { EmergencyBreakdownInput } from './emergencyReplacement';
import { breakdownLocationPersistFields } from './emergencyReplacement';
import { notifyEmergencyReplacementAssigned } from './notifications';
import { resolveVehicleIdForBooking } from './bookingVehicle';
import { supabase } from './supabase';
import { trimUserId } from './userId';

export type AvailableDriverRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  current_city: string | null;
  available_updated_at: string | null;
  avatar_url: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  vehicle_plate: string | null;
  is_guide_driver: boolean;
};

export async function setDriverAvailable(driverUserId: string, city: string) {
  const id = trimUserId(driverUserId);
  const trimmedCity = city.trim();
  if (!id) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }
  if (!trimmedCity) {
    return { ok: false as const, error: new Error('ქალაქი სავალდებულოა') };
  }

  const { error } = await supabase
    .from('users')
    .update({
      is_available: true,
      current_city: trimmedCity,
      available_updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false as const, error: new Error(error.message) };
  return { ok: true as const, error: null };
}

export async function setDriverUnavailable(driverUserId: string) {
  const id = trimUserId(driverUserId);
  if (!id) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const { error } = await supabase
    .from('users')
    .update({
      is_available: false,
      available_updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false as const, error: new Error(error.message) };
  return { ok: true as const, error: null };
}

export async function findAvailableDriversInCity(
  city: string,
  opts?: { vehicleType?: string | null; vehicleClass?: string | null },
) {
  const trimmedCity = city.trim();
  if (!trimmedCity) {
    return { data: [] as AvailableDriverRow[], error: new Error('ქალაქი სავალდებულოა') };
  }

  const rpcParams: {
    p_city: string;
    p_vehicle_type?: string;
    p_vehicle_class?: string;
  } = { p_city: trimmedCity };
  const vt = opts?.vehicleType?.trim();
  const vc = opts?.vehicleClass?.trim();
  if (vt) rpcParams.p_vehicle_type = vt;
  if (vc) rpcParams.p_vehicle_class = vc;

  const { data, error } = await supabase.rpc('list_available_drivers_in_city', rpcParams);

  if (error) {
    return { data: [] as AvailableDriverRow[], error: new Error(error.message) };
  }

  const rows = (data ?? []) as AvailableDriverRow[];
  return { data: rows, error: null };
}

/** Company assigns an available driver to a pending booking (emergency replacement). */
export async function assignEmergencyDriverToBooking(
  bookingRowId: string,
  companyUserId: string,
  driver: AvailableDriverRow,
  breakdown: EmergencyBreakdownInput,
) {
  const rowId = String(bookingRowId).trim();
  const companyId = trimUserId(companyUserId);
  const driverId = trimUserId(driver.id);
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  if (!companyId || !driverId) {
    return { ok: false as const, error: new Error('არასწორი მონაცემები') };
  }

  const breakdownFields = breakdownLocationPersistFields(breakdown);
  if (!breakdownFields.breakdown_location) {
    return {
      ok: false as const,
      error: new Error('მიუთითეთ სად დგას გაჭერილი ავტომობილი'),
    };
  }

  const { data: bookingRow, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, status, company_id, vehicle_type, vehicle_class, kind, booking_type, date_display, is_group_master, parent_booking_id, voucher_code, route, from_location, to_location, tour_days, transfer_in, transfer_out, group_code, leg_index, driver_id',
    )
    .eq('id', rowId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (fetchErr) return { ok: false as const, error: new Error(fetchErr.message) };
  if (!bookingRow) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ მოიძებნა') };
  }

  const row = bookingRow as {
    status?: string;
    is_group_master?: boolean | null;
    driver_id?: string | null;
    voucher_code?: string | null;
    kind?: string | null;
    booking_type?: string | null;
    route?: string | null;
    from_location?: string | null;
    to_location?: string | null;
    tour_days?: unknown;
    transfer_in?: unknown;
    transfer_out?: unknown;
  };

  if (row.is_group_master === true) {
    return {
      ok: false as const,
      error: new Error('კონვოის master-ზე დანიშვნა შეუძლებელია — აირჩიეთ კონკრეტული მანქანა (leg)'),
    };
  }

  const status = String(row.status ?? '').toLowerCase();
  if (status !== 'pending') {
    return { ok: false as const, error: new Error('მხოლოდ მოლოდინში მყოფ ჯავშანზე დანიშვნა შეიძლება') };
  }

  const existingDriverId = trimUserId(row.driver_id);
  if (existingDriverId && existingDriverId !== driverId) {
    return {
      ok: false as const,
      error: new Error('ამ ჯავშანზე უკვე სხვა მძღოლია მინიჭებული'),
    };
  }

  const bookingVehicleType =
    (bookingRow as { vehicle_type?: string | null }).vehicle_type ?? driver.vehicle_type;
  const bookingVehicleClass =
    (bookingRow as { vehicle_class?: string | null }).vehicle_class ?? driver.vehicle_class;

  const vehicleId = await resolveVehicleIdForBooking({
    driverId,
    vehicleType: bookingVehicleType,
    vehicleClass: bookingVehicleClass,
  });

  if (!vehicleId) {
    return {
      ok: false as const,
      error: new Error('მძღოლს არ აქვს შესაბამისი ტიპის/კლასის მანქანა ამ ჯავშნისთვის'),
    };
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      driver_id: driverId,
      status: 'pending',
      driver_display_name: driver.full_name?.trim() || null,
      driver_phone: driver.phone?.trim() || null,
      driver_plate: driver.vehicle_plate?.trim() || null,
      vehicle_id: vehicleId,
      is_emergency_replacement: true,
      breakdown_location: breakdownFields.breakdown_location,
      breakdown_location_type: breakdownFields.breakdown_location_type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error: new Error(error.message) };
  if (!data) {
    return { ok: false as const, error: new Error('დანიშვნა ვერ მოხერხდა') };
  }

  const voucherCode =
    row.voucher_code?.trim() || `KEKE-${rowId.slice(0, 8).toUpperCase()}`;

  void notifyEmergencyReplacementAssigned({
    bookingId: rowId,
    driverUserId: driverId,
    companyUserId: companyId,
    voucherCode,
    kind: String(row.kind ?? row.booking_type ?? 'transfer'),
    route: row.route,
    from_location: row.from_location,
    to_location: row.to_location,
    tour_days: row.tour_days,
    transfer_in: row.transfer_in,
    transfer_out: row.transfer_out,
    breakdownLocation: breakdownFields.breakdown_location,
    breakdownLocationType: breakdownFields.breakdown_location_type,
  });

  void setDriverUnavailable(driverId);
  void import('./groupBooking').then((m) => m.syncConvoyMasterFromBookingId(rowId));

  return { ok: true as const, error: null };
}
