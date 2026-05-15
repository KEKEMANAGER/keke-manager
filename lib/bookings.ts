import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { notifyBookingConfirmed } from './localNotifications';
import { supabase } from './supabase';

/** Minimal booking row shape from Realtime `postgres_changes` payloads. */
export type BookingRealtimeRecord = {
  status?: string;
  driver_id?: string | null;
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

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'completed' | 'cancelled';

export type BookingType = 'transfer' | 'tour' | 'day_tour';

export type FlightDirection = 'arrival' | 'departure';

/** One day in a tour itinerary (stored in `tour_days` jsonb). */
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
  transfer_in: TourTransferLeg | null;
  transfer_out: TourTransferLeg | null;
  comment: string | null;
  payment_method: string | null;
  price_gel: number;
};

/** Georgian label for company/driver UI */
export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'pending':
      return 'მოლოდინში';
    case 'confirmed':
      return 'დადასტურებული';
    case 'rejected':
      return 'უარყოფილი';
    case 'completed':
      return 'დასრულებული';
    case 'cancelled':
      return 'გაუქმებული';
    default:
      return status;
  }
}

export function bookingTypeLabel(type: string): string {
  switch (type) {
    case 'transfer':
      return 'ტრანსფერი';
    case 'tour':
      return 'ტური';
    case 'day_tour':
      return 'ერთდღიანი ტური';
    default:
      return type;
  }
}

export function routeSummary(row: BookingRow): string {
  if (row.kind === 'transfer' && row.from_location && row.to_location) {
    return `${row.from_location} → ${row.to_location}`;
  }
  return row.route?.trim() || '—';
}

export function formatBookingDate(row: BookingRow): string {
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
  return { data: (data ?? []) as BookingRow[], error };
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
  return { data: (data ?? []) as BookingRow[], error };
}

/** Open jobs: waiting for a driver */
export async function fetchOpenPendingBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'pending')
    .is('driver_id', null)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as BookingRow[], error };
}

export async function insertBooking(row: InsertBookingInput) {
  const companyClerkId = clerkId(row.company_id);
  if (!companyClerkId) {
    return { id: undefined, error: new Error('company_id (Clerk) არ არის მითითებული') };
  }
  const voucherCode = `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      company_id: companyClerkId,
      voucher_code: voucherCode,
      company_name: row.company_name,
      kind: row.kind,
      from_location: row.from_location,
      to_location: row.to_location,
      route: row.route,
      date_display: row.date_display,
      passengers: row.passengers,
      vehicle_class: row.vehicle_class,
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
      transfer_in: row.transfer_in,
      transfer_out: row.transfer_out,
      comment: row.comment,
      payment_method: row.payment_method,
      price_gel: row.price_gel,
      status: 'pending',
      driver_id: null,
    })
    .select('id')
    .maybeSingle();
  return { id: data?.id as string | undefined, error };
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
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({
      driver_id: driverClerkId,
      status: 'confirmed',
      driver_display_name: driver.displayName,
      driver_phone: driver.phone || null,
      driver_plate: driver.plate || null,
      updated_at: now,
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
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'rejected',
      updated_at: now,
    })
    .eq('id', rowId)
    .eq('status', 'pending')
    .is('driver_id', null)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ განახლდა') };
  }
  return { ok: true as const, error: null };
}

export async function completeBooking(bookingRowId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', rowId)
    .eq('status', 'confirmed')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false as const, error };
  if (!data) return { ok: false as const, error: new Error('ჯავშანი ვერ დასრულდა') };
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
