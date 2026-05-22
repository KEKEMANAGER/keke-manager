import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import i18n from '../src/lib/i18n';
import { formatDisplayDateTime, parseStoredDateTime } from './dateTime';
import { notifyBookingConfirmed } from './localNotifications';
import {
  createScheduleForAcceptedBooking,
  releaseDriverScheduleForBooking,
} from './driverSchedules';
import { notifyCompanyBookingAccepted, notifyMatchingDriversOfNewBooking } from './notifications';
import { sanitizeLanguageCodes } from './spokenLanguages';
import { fetchDriverProfile } from './profiles';
import { supabase } from './supabase';
import { trimUserId } from './userId';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  type VehicleClassCode,
  type VehicleTypeCode,
} from './vehicleCatalog';

/** Minimal booking row shape from Realtime `postgres_changes` payloads. */
export type BookingRealtimeRecord = {
  status?: string;
  driver_id?: string | null;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
  kind?: string | null;
  booking_type?: string | null;
};

export function isNewOpenPendingBookingInsert(
  payload: RealtimePostgresChangesPayload<BookingRealtimeRecord>,
): boolean {
  if (payload.eventType !== 'INSERT') return false;
  const row = payload.new;
  if (!row) return false;
  return row.status === 'pending';
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
  const rawStatus = String(raw.status ?? 'pending').trim().toLowerCase();
  const status: BookingStatus =
    rawStatus === 'confirmed' ? 'accepted' : (rawStatus as BookingStatus);
  const routeFromDb =
    (typeof raw.route === 'string' && raw.route.trim() ? raw.route : null) ??
    (typeof raw.route_description === 'string' && raw.route_description.trim()
      ? raw.route_description
      : null);
  return { ...raw, kind, status, route: routeFromDb } as BookingRow;
}

function hydrateBookingRows(rows: unknown[]): BookingRow[] {
  return rows.map((r) => hydrateBookingRow(r as Record<string, unknown>));
}

async function enrichBookingsWithUserVerification(rows: BookingRow[]): Promise<BookingRow[]> {
  if (rows.length === 0) return rows;

  const ids = new Set<string>();
  for (const row of rows) {
    const driverId = trimUserId(row.driver_id);
    const companyId = trimUserId(row.company_id);
    if (driverId) ids.add(driverId);
    if (companyId) ids.add(companyId);
  }
  if (ids.size === 0) return rows;

  const { data, error } = await supabase
    .from('users')
    .select('id, is_verified, avatar_url')
    .in('id', [...ids]);

  if (error) {
    if (__DEV__) {
      console.warn('[bookings] enrichBookingsWithUserVerification', error.message);
    }
    return rows;
  }

  const verifiedById = new Map<string, boolean>();
  const avatarById = new Map<string, string | null>();
  for (const row of data ?? []) {
    const u = row as { id: string; is_verified?: boolean | null; avatar_url?: string | null };
    verifiedById.set(String(u.id), !!u.is_verified);
    const url = u.avatar_url?.trim() ?? '';
    avatarById.set(String(u.id), url || null);
  }

  return rows.map((row) => ({
    ...row,
    driver_is_verified: row.driver_id
      ? (verifiedById.get(trimUserId(row.driver_id)) ?? false)
      : null,
    company_is_verified: verifiedById.get(trimUserId(row.company_id)) ?? false,
    driver_avatar_url: row.driver_id
      ? (avatarById.get(trimUserId(row.driver_id)) ?? null)
      : null,
    company_avatar_url: avatarById.get(trimUserId(row.company_id)) ?? null,
  }));
}

/** Legacy DBs still use `confirmed` in `bookings_status_check`; new migrations use `accepted`. */
function isBookingsStatusConstraintError(err: { message?: string } | null): boolean {
  const m = String(err?.message ?? '').toLowerCase();
  return m.includes('bookings_status_check') || (m.includes('check constraint') && m.includes('bookings'));
}

/** PostgREST: wrong `route` / `route_description` column for this DB. */
function shouldRetryBookingInsertAlternateRouteColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('schema cache') &&
    m.includes('could not find') &&
    (m.includes('route_description') || m.includes("'route'"))
  );
}

function isTourServiceKind(kind: BookingType): boolean {
  return kind === 'tour' || kind === 'day_tour';
}

/** DB/cache missing tour-specific columns → retry without JSON legs (detail stays in route). */
function shouldRetryBookingInsertWithoutTourColumns(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.includes('schema cache') || !m.includes('bookings')) return false;
  return (
    m.includes('itinerary') ||
    m.includes('transfer_in') ||
    m.includes('transfer_out') ||
    m.includes('tour_days')
  );
}

function shouldRetryBookingInsertWithoutKindColumn(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('schema cache') && m.includes('bookings') && m.includes("'kind'");
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
  /** Null = any class (matches all drivers for that `vehicle_type`). */
  vehicle_class: string | null;
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
  /** Populated by `enrichBookingsWithUserVerification` when listing bookings. */
  driver_is_verified?: boolean | null;
  company_is_verified?: boolean | null;
  driver_avatar_url?: string | null;
  company_avatar_url?: string | null;
};

export type InsertBookingInput = {
  /** Supabase Auth user id — maps to column `company_id`. */
  company_id: string;
  company_name: string | null;
  kind: BookingType;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  date_display: string | null;
  passengers: number;
  vehicle_type: string | null;
  /**
   * Optional. When null/omitted, stored as null and notifications go to every driver
   * with this `vehicle_type` (any class).
   */
  vehicle_class?: string | null;
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
  /** When set, booking is offered only to this driver (pending until they accept). */
  driver_id?: string | null;
  /** Driver must speak at least one of these language codes (empty = any). */
  required_languages?: string[] | null;
};

/** Localized booking status label */
export function bookingStatusLabel(status: BookingStatus): string {
  const key = `booking.status.${status}`;
  if (i18n.exists(key)) return i18n.t(key);
  return status;
}

export { bookingKindLabel, bookingTypeLabel, resolveBookingKindLabelCode } from './bookingLabels';

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

/** Primary key of `bookings` row (Postgres uuid), not a user id. */
export function isBookingRowUuid(value: string): boolean {
  return BOOKING_ROW_UUID_RE.test(String(value).trim());
}

/** Single booking row; optional `companyUserId` scopes to that company's bookings. */
export async function fetchBookingById(
  bookingId: string,
  companyUserId?: string,
): Promise<{ data: BookingRow | null; error: Error | null }> {
  const id = String(bookingId ?? '').trim();
  if (!isBookingRowUuid(id)) {
    return { data: null, error: new Error('invalid booking id') };
  }
  let query = supabase.from('bookings').select('*').eq('id', id);
  const companyId = trimUserId(companyUserId);
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  if (!data) {
    return { data: null, error: null };
  }
  return { data: hydrateBookingRow(data as Record<string, unknown>), error: null };
}

/** All rows for this company. Filters `company_id` = Supabase user id. */
export async function fetchBookingsByCompanyId(companyUserId: string) {
  const id = trimUserId(companyUserId);
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: false });
  return {
    data: await enrichBookingsWithUserVerification(hydrateBookingRows(data ?? [])),
    error,
  };
}

/** Rows assigned to this driver. Filters `driver_id` = Supabase user id. */
export async function fetchBookingsForDriver(driverUserId: string) {
  const id = trimUserId(driverUserId);
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('driver_id', id)
    .order('updated_at', { ascending: false });
  return {
    data: await enrichBookingsWithUserVerification(hydrateBookingRows(data ?? [])),
    error,
  };
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

/** Explains zero open-job rows when filtering by driver prefs is impossible. */
export type DriverOpenJobsHint = 'profile_vehicle_required';

/**
 * Pending jobs matching this driver's active vehicle type/class.
 *
 * Matching priority:
 *   1. All active vehicles in `vehicles` (is_active = true) — preferred.
 *   2. Fallback to `profiles.vehicle_type/class` for drivers who haven't
 *      set up vehicles yet (backwards-compatible).
 */
export async function fetchOpenPendingBookingsForDriver(driverUserId: string): Promise<{
  data: BookingRow[];
  error: Error | null;
  hint?: DriverOpenJobsHint;
}> {
  const id = String(driverUserId ?? '').trim();
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }

  // Verification: accept `profiles.is_verified` OR `users.is_verified`
  // (admin verification may only land on `users`; notifications use the same OR rule).
  const { data: profileRow, error: profileError } = await fetchDriverProfile(id);
  if (profileError) {
    return { data: [] as BookingRow[], error: profileError };
  }
  let verified = profileRow?.is_verified === true;
  if (!verified) {
    const { data: userRow } = await supabase
      .from('users')
      .select('is_verified')
      .eq('id', id)
      .maybeSingle();
    verified = (userRow as { is_verified?: boolean | null } | null)?.is_verified === true;
  }
  if (!verified) {
    return { data: [] as BookingRow[], error: null };
  }

  // Primary source: all active vehicles (multiple allowed).
  const { data: activeVehicles } = await supabase
    .from('vehicles')
    .select('type, class')
    .eq('driver_id', id)
    .eq('is_active', true);

  type VehicleMatch = { type: VehicleTypeCode; class: VehicleClassCode };
  const activeMatches: VehicleMatch[] = [];
  for (const v of activeVehicles ?? []) {
    const row = v as { type?: string | null; class?: string | null };
    const type = normalizeVehicleType(row.type ?? '');
    const cls = normalizeVehicleClass(row.class ?? '');
    if (type && cls) activeMatches.push({ type, class: cls });
  }

  const fallbackType = normalizeVehicleType(profileRow?.vehicle_type ?? '');
  const fallbackClass = normalizeVehicleClass(profileRow?.vehicle_class ?? '');
  const matchPairs: VehicleMatch[] =
    activeMatches.length > 0
      ? activeMatches
      : fallbackType && fallbackClass
        ? [{ type: fallbackType, class: fallbackClass }]
        : [];

  if (matchPairs.length === 0) {
    return {
      data: [] as BookingRow[],
      error: null,
      hint: 'profile_vehicle_required',
    };
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'pending')
    .or(`driver_id.is.null,driver_id.eq.${id}`)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [] as BookingRow[], error: new Error(error.message) };
  }

  const rows = (data ?? []).filter((r) => {
    const row = r as {
      driver_id?: string | null;
      vehicle_type?: string | null;
      vehicle_class?: string | null;
    };
    const rowDriverId = row.driver_id != null ? String(row.driver_id).trim() : '';
    if (rowDriverId && rowDriverId !== id) {
      return false;
    }
    const bookingType = normalizeVehicleType(row.vehicle_type ?? '');
    const bookingClass = normalizeVehicleClass(row.vehicle_class ?? '');
    return matchPairs.some(
      (m) =>
        m.type === bookingType &&
        (!bookingClass || !m.class || bookingClass === m.class),
    );
  });

  return { data: hydrateBookingRows(rows), error: null };
}

export async function insertBooking(row: InsertBookingInput) {
  const companyUserId = trimUserId(row.company_id);
  if (!companyUserId) {
    return { id: undefined, error: new Error('company_id არ არის მითითებული') };
  }

  const kind = normalizeBookingKind(row.kind);
  const vehicleType = normalizeVehicleType(row.vehicle_type);
  const vehicleClass = normalizeVehicleClass(row.vehicle_class);
  if (!vehicleType) {
    return { id: undefined, error: new Error('vehicle_type სავალდებულოა') };
  }

  const voucherCode = `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const assignedDriverId = trimUserId(row.driver_id);

  function buildBookingInsertBody(
    routeCol: 'route' | 'route_description',
    bookingKindForDb: BookingType,
    opts: { includeTourColumns: boolean; includeKindColumn: boolean },
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      company_id: companyUserId,
      voucher_code: voucherCode,
      company_name: row.company_name,
      booking_type: bookingKindForDb,
      from_location: row.from_location,
      to_location: row.to_location,
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
      comment: row.comment,
      payment_method: row.payment_method,
      price_gel: row.price_gel,
      created_by_name: row.created_by_name?.trim() || null,
      status: 'pending',
      driver_id: assignedDriverId || null,
      required_languages: (() => {
        const codes = sanitizeLanguageCodes(row.required_languages ?? []);
        return codes.length > 0 ? codes : null;
      })(),
    };

    if (opts.includeKindColumn) {
      body.kind = bookingKindForDb;
    }

    if (opts.includeTourColumns && isTourServiceKind(bookingKindForDb)) {
      body.tour_days = row.tour_days;
      body.itinerary = row.itinerary;
      body.transfer_in = row.transfer_in;
      body.transfer_out = row.transfer_out;
    }

    if (routeCol === 'route') {
      body.route = row.route;
    } else {
      body.route_description = row.route;
    }

    return body;
  }

  async function tryInsertRouteVariants(
    bookingKindForDb: BookingType,
    includeTourColumns: boolean,
    includeKindColumn: boolean,
  ) {
    for (let r = 0; r < 2; r++) {
      const routeCol = r === 0 ? ('route' as const) : ('route_description' as const);
      const payload = buildBookingInsertBody(routeCol, bookingKindForDb, {
        includeTourColumns,
        includeKindColumn,
      });
      const res = await supabase.from('bookings').insert(payload).select('id').maybeSingle();
      if (!res.error) return res;
      if (r === 0 && shouldRetryBookingInsertAlternateRouteColumn(res.error.message)) {
        continue;
      }
      return res;
    }
    throw new Error('insertBooking: route column retry exhausted');
  }

  function isBookingsBookingTypeConstraintError(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes('bookings_booking_type_check') ||
      (m.includes('check constraint') && m.includes('booking_type'))
    );
  }

  async function runWithStrippedTourAndKindOptions(
    bookingKindForDb: BookingType,
    initialTourCols: boolean,
    initialKindCol: boolean,
  ) {
    let tourCols = initialTourCols;
    let kindCol = initialKindCol;
    let res = await tryInsertRouteVariants(bookingKindForDb, tourCols, kindCol);

    if (res.error && tourCols && shouldRetryBookingInsertWithoutTourColumns(res.error.message)) {
      tourCols = false;
      res = await tryInsertRouteVariants(bookingKindForDb, tourCols, kindCol);
    }
    if (res.error && kindCol && shouldRetryBookingInsertWithoutKindColumn(res.error.message)) {
      kindCol = false;
      res = await tryInsertRouteVariants(bookingKindForDb, tourCols, kindCol);
    }
    return res;
  }

  let dbKind = kind;
  let result = await runWithStrippedTourAndKindOptions(dbKind, isTourServiceKind(dbKind), true);

  if (
    result.error &&
    kind === 'day_tour' &&
    dbKind === 'day_tour' &&
    isBookingsBookingTypeConstraintError(result.error.message)
  ) {
    dbKind = 'tour';
    result = await runWithStrippedTourAndKindOptions(dbKind, isTourServiceKind(kind), true);
  }

  const { data, error } = result;

  if (error) {
    return { id: undefined, error: new Error(error.message) };
  }

  const bookingId = data?.id as string | undefined;
  if (bookingId) {
    void notifyMatchingDriversOfNewBooking({
      kind,
      vehicleType,
      vehicleClass: vehicleClass ?? undefined,
      driverId: assignedDriverId || undefined,
      bookingId,
      showAlertIfEmpty: true,
      requiredLanguages: row.required_languages ?? undefined,
      availability: {
        kind,
        date_display: row.date_display,
        itinerary: row.itinerary,
        transfer_in: row.transfer_in,
        transfer_out: row.transfer_out,
      },
    });
  }

  return { id: bookingId, error: null };
}

export async function acceptBooking(
  /** `bookings.id` (uuid) */
  bookingRowId: string,
  driver: {
    driverId: string;
    displayName: string;
    phone: string;
    plate: string;
  },
) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return {
      ok: false as const,
      error: new Error('booking id უნდა იყოს ჯავშნის uuid'),
    };
  }
  const driverUserId = trimUserId(driver.driverId);
  if (!driverUserId) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const runAccept = (assignStatus: 'accepted' | 'confirmed') =>
    supabase
      .from('bookings')
      .update({
        driver_id: driverUserId,
        status: assignStatus,
        driver_display_name: driver.displayName,
        driver_phone: driver.phone || null,
        driver_plate: driver.plate || null,
      })
      .eq('id', rowId)
      .eq('status', 'pending')
      .or(`driver_id.is.null,driver_id.eq.${driverUserId}`)
      .select('id')
      .maybeSingle();

  let { data, error } = await runAccept('accepted');
  if (error && isBookingsStatusConstraintError(error)) {
    ({ data, error } = await runAccept('confirmed'));
  }

  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი უკვე აღებულია ან მიუწვდომელია') };
  }
  void createScheduleForAcceptedBooking(rowId, driverUserId);
  void notifyBookingConfirmed();
  const { data: companyRow } = await supabase
    .from('bookings')
    .select('company_id')
    .eq('id', rowId)
    .maybeSingle();
  const companyUid = String((companyRow as { company_id?: string | null } | null)?.company_id ?? '').trim();
  if (companyUid) void notifyCompanyBookingAccepted({ companyUserId: companyUid, bookingId: rowId });
  return { ok: true as const, error: null };
}

export async function rejectBooking(
  /** `bookings.id` (uuid) */
  bookingRowId: string,
) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return {
      ok: false as const,
      error: new Error('booking id უნდა იყოს ჯავშნის uuid'),
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

export async function completeBooking(bookingRowId: string, driverUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const drv = trimUserId(driverUserId);
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
  if (data) {
    void releaseDriverScheduleForBooking(rowId);
  }
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანის დასრულება ხელმისაწვდომია მხოლოდ „გზაში“ სტატუსში') };
  }
  return { ok: true as const, error: null };
}

/** Driver starts trip after accepting (accepted → in_progress). */
export async function startBookingTrip(bookingRowId: string, driverUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const drv = trimUserId(driverUserId);
  if (!drv) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'in_progress' })
    .eq('id', rowId)
    .or('status.eq.accepted,status.eq.confirmed')
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

/** Company cancels only while still pending. */
export async function cancelBooking(bookingId: string, companyId: string) {
  return cancelBookingByCompany(bookingId, companyId);
}

/** Company cancels only while still pending (no driver assigned). */
export async function cancelBookingByCompany(bookingRowId: string, companyUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const companyId = trimUserId(companyUserId);
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

export async function aggregateCompanyStats(companyUserId: string) {
  const id = trimUserId(companyUserId);
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

export async function aggregateDriverStats(driverUserId: string) {
  const id = trimUserId(driverUserId);
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
