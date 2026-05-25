import { supabase } from './supabase';
import type { BookingRow } from './bookings';
import {
  notifyDriverBookingUpdated,
  notifyHostBookingUpdated,
} from './notifications';
import { trimUserId } from './userId';

const BOOKING_UPDATE_FIELDS = [
  'from_location',
  'to_location',
  'route',
  'date_display',
  'passengers',
  'vehicle_type',
  'vehicle_class',
  'flight_number',
  'meet_greet',
  'sign_text',
  'pickup_sign_logo_url',
  'passenger_name',
  'passenger_phone',
  'comment',
  'client_price',
  'commission',
  'price_gel',
  'tour_days',
  'itinerary',
  'transfer_in',
  'transfer_out',
] as const;

type UpdateField = (typeof BOOKING_UPDATE_FIELDS)[number];

function labelForField(key: string): string {
  const labels: Record<string, string> = {
    from_location: 'საიდან',
    to_location: 'სად',
    route: 'მარშრუტი',
    date_display: 'თარიღი',
    passengers: 'მგზავრები',
    vehicle_type: 'ტიპი',
    vehicle_class: 'კლასი',
    flight_number: 'რეისი',
    sign_text: 'დასახვედრი სახელი',
    pickup_sign_logo_url: 'დასახვედრი ლოგო',
    passenger_name: 'მგზავრი',
    passenger_phone: 'ტელეფონი',
    comment: 'კომენტარი',
    client_price: 'კლიენტის ფასი',
    commission: 'კომისია',
    price_gel: 'ფასი',
    tour_days: 'ტურის დღეები',
    itinerary: 'მარშრუტი',
    transfer_in: 'ჩამოსვლის ტრანსფერი',
    transfer_out: 'გამგზავრების ტრანსფერი',
  };
  return labels[key] ?? key;
}

function serializeValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function computeBookingDiff(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
): Record<string, { old: string; new: string; label: string }> {
  const diff: Record<string, { old: string; new: string; label: string }> = {};
  for (const key of BOOKING_UPDATE_FIELDS) {
    const o = serializeValue(oldRow[key]);
    const n = serializeValue(newRow[key]);
    if (o !== n) {
      diff[key] = { old: o, new: n, label: labelForField(key) };
    }
  }
  return diff;
}

export function canCompanyEditBooking(status: string): {
  allowed: boolean;
  warn: boolean;
  reason?: string;
} {
  if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
    return { allowed: false, warn: false, reason: 'completed_or_cancelled' };
  }
  if (status === 'in_progress') {
    return { allowed: true, warn: true };
  }
  return { allowed: true, warn: false };
}

export async function fetchBookingForCompanyEdit(bookingId: string, companyUserId: string) {
  const id = bookingId.trim();
  const companyId = trimUserId(companyUserId);
  if (!id || !companyId) {
    return { data: null, error: new Error('missing_ids') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: new Error('booking_not_found') };
  return { data: data as BookingRow, error: null };
}

export async function acknowledgeBookingUpdate(
  bookingId: string,
  driverUserId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ driver_update_pending: false })
    .eq('id', bookingId.trim())
    .or(`driver_id.eq.${driverUserId},host_driver_id.eq.${driverUserId}`);
  return { error: error ? new Error(error.message) : null };
}

export async function updateBookingByCompany(
  bookingId: string,
  companyUserId: string,
  changes: Partial<Record<UpdateField, unknown>>,
  reason?: string,
): Promise<{ data: BookingRow | null; error: Error | null; diff: Record<string, { old: string; new: string; label: string }> }> {
  const id = bookingId.trim();
  const companyId = trimUserId(companyUserId);
  if (!id || !companyId) {
    return { data: null, error: new Error('missing_ids'), diff: {} };
  }

  const { data: oldBooking, error: fetchErr } = await fetchBookingForCompanyEdit(id, companyId);
  if (fetchErr || !oldBooking) {
    return { data: null, error: fetchErr ?? new Error('booking_not_found'), diff: {} };
  }

  const gate = canCompanyEditBooking(oldBooking.status);
  if (!gate.allowed) {
    return { data: null, error: new Error(gate.reason ?? 'edit_not_allowed'), diff: {} };
  }

  const payload: Record<string, unknown> = {
    ...changes,
    updated_at: new Date().toISOString(),
    driver_update_pending: true,
  };

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    return { data: null, error: new Error(updateErr.message), diff: {} };
  }
  if (!updated) {
    return { data: null, error: new Error('update_failed'), diff: {} };
  }

  const diff = computeBookingDiff(
    oldBooking as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );

  if (Object.keys(diff).length > 0) {
    await supabase.from('booking_history').insert({
      booking_id: id,
      changed_by: companyId,
      changes: diff,
      reason: reason?.trim() || null,
    });

    await supabase
      .from('bookings')
      .update({ update_change_summary: diff })
      .eq('id', id);

    const row = updated as BookingRow;
    if (row.driver_id) {
      void notifyDriverBookingUpdated(row.driver_id, id, diff);
    }
    if (row.host_driver_id) {
      void notifyHostBookingUpdated(row.host_driver_id, id, diff);
    }
  } else {
    await supabase.from('bookings').update({ driver_update_pending: false }).eq('id', id);
  }

  return { data: updated as BookingRow, error: null, diff };
}
