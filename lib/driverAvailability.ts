import { isBookingRowUuid } from './bookings';
import { notifyMatchingDriversOfNewBooking } from './notifications';
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

export async function findAvailableDriversInCity(city: string) {
  const trimmedCity = city.trim();
  if (!trimmedCity) {
    return { data: [] as AvailableDriverRow[], error: new Error('ქალაქი სავალდებულოა') };
  }

  const { data, error } = await supabase.rpc('list_available_drivers_in_city', {
    p_city: trimmedCity,
  });

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

  const { data: bookingRow, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, company_id, vehicle_type, vehicle_class, kind, booking_type, date_display')
    .eq('id', rowId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (fetchErr) return { ok: false as const, error: new Error(fetchErr.message) };
  if (!bookingRow) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ მოიძებნა') };
  }

  const status = String((bookingRow as { status?: string }).status ?? '').toLowerCase();
  if (status !== 'pending') {
    return { ok: false as const, error: new Error('მხოლოდ მოლოდინში მყოფ ჯავშანზე დანიშვნა შეიძლება') };
  }

  const vehicleId = await resolveVehicleIdForBooking({
    driverId,
    vehicleType: (bookingRow as { vehicle_type?: string | null }).vehicle_type ?? driver.vehicle_type,
    vehicleClass: (bookingRow as { vehicle_class?: string | null }).vehicle_class ?? driver.vehicle_class,
  });

  const { data, error } = await supabase
    .from('bookings')
    .update({
      driver_id: driverId,
      status: 'pending',
      driver_display_name: driver.full_name?.trim() || null,
      driver_phone: driver.phone?.trim() || null,
      driver_plate: driver.vehicle_plate?.trim() || null,
      vehicle_id: vehicleId,
    })
    .eq('id', rowId)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .select('id, kind, booking_type, vehicle_type, vehicle_class, date_display')
    .maybeSingle();

  if (error) return { ok: false as const, error: new Error(error.message) };
  if (!data) {
    return { ok: false as const, error: new Error('დანიშვნა ვერ მოხერხდა') };
  }

  void notifyMatchingDriversOfNewBooking({
    kind: String((data as { kind?: string }).kind ?? (data as { booking_type?: string }).booking_type ?? 'transfer'),
    vehicleType: String((data as { vehicle_type?: string | null }).vehicle_type ?? ''),
    vehicleClass: (data as { vehicle_class?: string | null }).vehicle_class ?? undefined,
    driverId,
    bookingId: rowId,
    showAlertIfEmpty: false,
    availability: {
      kind: String((data as { kind?: string }).kind ?? 'transfer'),
      date_display: (data as { date_display?: string | null }).date_display ?? null,
    },
  });

  return { ok: true as const, error: null };
}
