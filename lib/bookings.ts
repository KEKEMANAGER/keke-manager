import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import i18n from '../src/lib/i18n';
import { formatDisplayDateTime, parseStoredDateTime } from './dateTime';
import { notifyBookingConfirmed } from './localNotifications';
import { notifyMatchingDriversOfNewBooking } from './notifications';
import { fetchDriverProfile } from './profiles';
import { supabase } from './supabase';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';

/** Minimal booking row shape from Realtime `postgres_changes` payloads. */
export type BookingRealtimeRecord = {
  status?: string;
  driver_id?: string | null;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
};

export function isNewOpenPendingBookingInsert(
  payload: RealtimePostgresChangesPayload<BookingRealtimeRecord>,
): boolean {
  if (payload.eventType !== 'INSERT') return false;
  const row = payload.new;
  if (!row) return false;
  const open = row.driver_id == null || String(row.driver_id).trim() === '';
  return row.status === 'pending' && open;
}

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type BookingType =
  | 'transfer'
  | 'transfer_arrival'
  | 'transfer_departure'
  | 'tour'
  | 'day_tour';

export function isTransferKind(kind: string): boolean {
  return kind === 'transfer' || kind === 'transfer_arrival' || kind === 'transfer_departure';
}

/** Canonical `kind` for DB NOT NULL: transfer | tour | day_tour */
export function normalizeBookingKind(kind: BookingType | string): BookingType {
  const k = String(kind).trim();
  if (k === 'transfer' || k === 'transfer_arrival' || k === 'transfer_departure') return 'transfer';
  if (k === 'tour') return 'tour';
  if (k === 'day_tour' || k === 'dayTour') return 'day_tour';
  return 'transfer';
}

function hydrateBookingRow(raw: Record<string, unknown>): BookingRow {
  const kind = (raw.kind ?? raw.booking_type ?? 'transfer') as BookingType;
  const rawStatus = String(raw.status ?? 'pending');
  const status: BookingStatus =
    rawStatus === 'confirmed' ? 'accepted' : (rawStatus as BookingStatus);
  return { ...raw, kind, status } as BookingRow;
}

function hydrateBookingRows(rows: unknown[]): BookingRow[] {
  return rows.map((r) => hydrateBookingRow(r as Record<string, unknown>));
}

export type FlightDirection = 'arrival' | 'departure';

/** One day in a tour itinerary (stored in `itinerary` jsonb). */
export type ItineraryDay = {
  day: number;
  from: string;
  to: string;
  stops: string;
};

/** @deprecated Legacy shape in `tour_days`; prefer `itinerary`. */
export type TourDayPersisted = {
  id: string;
  date: string;
  fromPlace: string;
  toPlace: string;
  stops: string[];
  overnight: boolean;
};

/** Arrival / departure transfer leg (stored in `transfer_in` / `transfer_out` jsonb). */
export type TourTransferLeg = {
  date: string;
  flight: string;
  passengerName: string;
};

export type BookingRow = {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  driver_id: string | null;
  status: BookingStatus;
  kind: BookingType;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  date_display: string | null;
  passengers: number;
  vehicle_type: string | null;
  vehicle_class: string;
  flight_number: string | null;
  meet_greet: boolean | null;
  sign_text: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  flight_direction: FlightDirection | string | null;
  pickup_time: string | null;
  client_price: number | null;
  commission: number | null;
  tour_days: TourDayPersisted[] | null;
  itinerary: ItineraryDay[] | null;
  transfer_in: TourTransferLeg | null;
  transfer_out: TourTransferLeg | null;
  comment: string | null;
  payment_method: string | null;
  price_gel: number;
  company_name: string | null;
  driver_display_name: string | null;
  driver_phone: string | null;
  driver_plate: string | null;
  /** Set on insert; optional when row predates column. */
  voucher_code?: string | null;
  /** Tour operator / staff name who created the booking. */
  created_by_name?: string | null;
};

export type InsertBookingInput = {
  /** Clerk `users.id` for the company (text, e.g. `user_...`). Maps to column `company_id`. */
  company_id: string;
  company_name: string | null;
  kind: BookingType;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  date_display: string | null;
  passengers: number;
  vehicle_type: string | null;
  vehicle_class: string;
  flight_number: string | null;
  meet_greet: boolean;
  sign_text: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  flight_direction: FlightDirection | null;
  pickup_time: string | null;
  client_price: number | null;
  commission: number | null;
  tour_days: TourDayPersisted[] | null;
  itinerary: ItineraryDay[] | null;
  transfer_in: TourTransferLeg | null;
  transfer_out: TourTransferLeg | null;
  comment: string | null;
  payment_method: string | null;
  price_gel: number;
  created_by_name?: string | null;
};

/** Localized booking status label */
export function bookingStatusLabel(status: BookingStatus): string {
  const key = `booking.status.${status}`;
  if (i18n.exists(key)) return i18n.t(key);
  return status;
}

export function bookingTypeLabel(type: string): string {
  const key = `booking.type.${type}`;
  if (i18n.exists(key)) return i18n.t(key);
  return type;
}

export function routeSummary(row: BookingRow): string {
  if (isTransferKind(row.kind) && row.from_location && row.to_location) {
    return `${row.from_location} → ${row.to_location}`;
  }
  return row.route?.trim() || '—';
}

export function formatBookingDate(row: BookingRow): string {
  const parsed = parseStoredDateTime(row.date_display);
  if (parsed) return formatDisplayDateTime(parsed);
  if (row.date_display?.trim()) return row.date_display.trim();
  try {
    return new Date(row.created_at).toLocaleString('ka-GE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return row.created_at;
  }
}

const BOOKING_ROW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Primary key of `bookings` row (Postgres uuid), not a Clerk id. */
export function isBookingRowUuid(value: string): boolean {
  return BOOKING_ROW_UUID_RE.test(String(value).trim());
}

function clerkId(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

/** All rows for this company. Filters `company_id` (text) = Clerk company user id. */
export async function fetchBookingsByCompanyId(companyClerkId: string) {
  const id = clerkId(companyClerkId);
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: false });
  return { data: hydrateBookingRows(data ?? []), error };
}

/** Rows assigned to this driver. Filters `driver_id` (text) = Clerk driver user id. */
export async function fetchBookingsForDriver(driverClerkId: string) {
  const id = clerkId(driverClerkId);
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('driver_id', id)
    .order('updated_at', { ascending: false });
  return { data: hydrateBookingRows(data ?? []), error };
}

/** Open jobs: waiting for a driver (unfiltered — prefer `fetchOpenPendingBookingsForDriver`). */
export async function fetchOpenPendingBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'pending')
    .is('driver_id', null)
    .order('created_at', { ascending: false });
  return { data: hydrateBookingRows(data ?? []), error };
}

/** Pending jobs matching this driver's `profiles.vehicle_type` / `vehicle_class`. */
export async function fetchOpenPendingBookingsForDriver(driverUserId: string) {
  const id = String(driverUserId ?? '').trim();
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }

  const { data: profile, error: profileError } = await fetchDriverProfile(id);
  if (profileError) {
    return { data: [] as BookingRow[], error: profileError };
  }
  if (!profile?.vehicle_type || !profile?.vehicle_class) {
    if (__DEV__) {
      console.warn('[fetchOpenPendingBookingsForDriver] profile missing vehicle_type/class', id);
    }
    return { data: [] as BookingRow[], error: null };
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'pending')
    .is('driver_id', null)
    .eq('vehicle_type', profile.vehicle_type)
    .eq('vehicle_class', profile.vehicle_class)
    .order('created_at', { ascending: false });



}

export async function insertBooking(row: InsertBookingInput) {
  const companyClerkId = clerkId(row.company_id);
  if (!companyClerkId) {
    return { id: undefined, error: new Error('company_id (Clerk) არ არის მითითებული') };
  }

  const kind = normalizeBookingKind(row.kind);
  const vehicleType = normalizeVehicleType(row.vehicle_type);
  const vehicleClass = normalizeVehicleClass(row.vehicle_class);
  if (!vehicleType) {
    return { id: undefined, error: new Error('vehicle_type სავალდებულოა') };
  }
  if (!vehicleClass) {
    return { id: undefined, error: new Error('vehicle_class სავალდებულოა') };
  }

  const voucherCode = `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      company_id: companyClerkId,
      voucher_code: voucherCode,
      company_name: row.company_name,
      kind,
      booking_type: kind,
      from_location: row.from_location,
      to_location: row.to_location,
      route: row.route,
      date_display: row.date_display,
      passengers: row.passengers,
      vehicle_type: vehicleType,
      vehicle_class: vehicleClass,
      flight_number: row.flight_number,
      meet_greet: row.meet_greet,
      sign_text: row.sign_text,
      passenger_name: row.passenger_name,
      passenger_phone: row.passenger_phone,
      flight_direction: row.flight_direction,
      pickup_time: row.pickup_time,
      client_price: row.client_price,
      commission: row.commission,
      tour_days: row.tour_days,
      itinerary: row.itinerary,
      transfer_in: row.transfer_in,
      transfer_out: row.transfer_out,
      comment: row.comment,
      payment_method: row.payment_method,
      price_gel: row.price_gel,
      created_by_name: row.created_by_name?.trim() || null,
      status: 'pending',
      driver_id: null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    return { id: undefined, error };
  }

  const bookingId = data?.id as string | undefined;
  if (bookingId) {
    void notifyMatchingDriversOfNewBooking({
      vehicleType,
      vehicleClass,
      bookingId,
      showAlertIfEmpty: true,
    });
  }

  return { id: bookingId, error: null };
}

export async function acceptBooking(
  /** `bookings.id` (uuid), not a Clerk user id */
  bookingRowId: string,
  driver: {
    clerkId: string;
    displayName: string;
    phone: string;
    plate: string;
  },
) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return {
      ok: false as const,
      error: new Error('booking id უნდა იყოს ჯავშნის uuid, არა Clerk id'),
    };
  }
  const driverClerkId = clerkId(driver.clerkId);
  if (!driverClerkId) {
    return { ok: false as const, error: new Error('მძღოლის Clerk id არ არის') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({
      driver_id: driverClerkId,
      status: 'accepted',
      driver_display_name: driver.displayName,
      driver_phone: driver.phone || null,
      driver_plate: driver.plate || null,
    })
    .eq('id', rowId)
    .eq('status', 'pending')
    .is('driver_id', null)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი უკვე აღებულია ან მიუწვდომელია') };
  }
  void notifyBookingConfirmed();
  return { ok: true as const, error: null };
}

export async function rejectBooking(
  /** `bookings.id` (uuid), not a Clerk user id */
  bookingRowId: string,
) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return {
      ok: false as const,
      error: new Error('booking id უნდა იყოს ჯავშნის uuid, არა Clerk id'),
    };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'rejected',
      driver_id: null,
      driver_display_name: null,
      driver_phone: null,
      driver_plate: null,
    })
    .eq('id', rowId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (__DEV__) {
      console.warn('[rejectBooking]', error.message, { rowId });
    }
    return { ok: false as const, error };
  }
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ განახლდა') };
  }
  return { ok: true as const, error: null };
}

export async function completeBooking(bookingRowId: string, driverClerkId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const drv = clerkId(driverClerkId);
  if (!drv) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', rowId)
    .eq('status', 'in_progress')
    .eq('driver_id', drv)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანის დასრულება ხელმისაწვდომია მხოლოდ „გზაში“ სტატუსში') };
  }
  return { ok: true as const, error: null };
}

/** Driver starts trip after accepting (accepted → in_progress). */
export async function startBookingTrip(bookingRowId: string, driverClerkId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const drv = clerkId(driverClerkId);
  if (!drv) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'in_progress' })
    .eq('id', rowId)
    .eq('status', 'accepted')
    .eq('driver_id', drv)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false as const, error };
  if (!data) {
    return {
      ok: false as const,
      error: new Error('დაწყება ვერ მოხერხდა — ჯავშანი სხვა მდგომარეობაშია ან სხვა მძღოლისაა'),
    };
  }
  return { ok: true as const, error: null };
}

/** Company cancels only while still pending (no driver assigned). */
export async function cancelBookingByCompany(bookingRowId: string, companyClerkId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const companyId = clerkId(companyClerkId);
  if (!companyId) {
    return { ok: false as const, error: new Error('company id არ არის') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', rowId)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false as const, error };
  if (!data) {
    return {
      ok: false as const,
      error: new Error('გაუქმება შესაძლებელია მხოლოდ „მოლოდინში“ ჯავშნისთვის'),
    };
  }
  return { ok: true as const, error: null };
}

export async function aggregateCompanyStats(companyClerkId: string) {
  const id = clerkId(companyClerkId);
  if (!id) {
    return { total: 0, spent: 0, error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('price_gel, status')
    .eq('company_id', id);
  if (error || !data) return { total: 0, spent: 0, error };
  const rows = data as { price_gel: number; status: BookingStatus }[];
  const total = rows.length;
  const spent = rows
    .filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Number(r.price_gel || 0), 0);
  return { total, spent, error: null };
}

export async function aggregateDriverStats(driverClerkId: string) {
  const id = clerkId(driverClerkId);
  if (!id) {
    return { completed: 0, earnings: 0, error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('price_gel, status')
    .eq('driver_id', id);
  if (error || !data) return { completed: 0, earnings: 0, error };
  const rows = data as { price_gel: number; status: BookingStatus }[];
  const completed = rows.filter((r) => r.status === 'completed').length;
  const earnings = rows
    .filter((r) => r.status === 'completed')
    .reduce((s, r) => s + Number(r.price_gel || 0), 0);
  return { completed, earnings, error: null };
}

export function subscribeBookingsChanges(
  onEvent: (payload: RealtimePostgresChangesPayload<BookingRealtimeRecord>) => void,
): RealtimeChannel {
  const channelName = `bookings-${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      (payload) => {
        onEvent(payload as RealtimePostgresChangesPayload<BookingRealtimeRecord>);
      },
    )
    .subscribe();
  return channel;
}

export function unsubscribeChannel(channel: RealtimeChannel) {
  void supabase.removeChannel(channel);
}
