import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import i18n from '../src/lib/i18n';
import {
  driverMatchesRequestedCategory,
  normalizeRequestedDriverCategory,
  type RequestedDriverCategory,
} from './driverCategory';
import { formatDisplayDateTime, parseStoredDateTime } from './dateTime';
import { notifyBookingConfirmed } from './localNotifications';
import {
  createScheduleForAcceptedBooking,
  releaseDriverScheduleForBooking,
} from './driverSchedules';
import { notifyBookingAssignedByHost, notifyHostTourCompleted } from './fleetNotifications';
import { completedDriverEarningsGel, hostNetGel } from './bookingPayout';
import { isHiredOrFleetSubDriver } from './hiredDriver';
import {
  notifyBookingVoucherCreated,
  notifyCompanyBookingAccepted,
  notifyCompanyDriverCancelledBooking,
  notifyMatchingDriversOfNewBooking,
} from './notifications';
import { resolveVehicleIdForBooking } from './bookingVehicle';
import { formatLocationRoute } from './bookingLocations';
import { formatTourBookingNotificationBody } from './tourDays';
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

/** Values allowed by `bookings_kind_check` / strict `booking_type` checks. */
export type DbCanonicalKind = 'transfer' | 'tour' | 'day_tour';

export function isTransferKind(kind: string): boolean {
  return kind === 'transfer' || kind === 'transfer_arrival' || kind === 'transfer_departure';
}

/** Canonical `kind` / strict `booking_type` for DB: transfer | tour | day_tour */
export function normalizeBookingKind(kind: BookingType | string): DbCanonicalKind {
  const k = String(kind ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (k === 'transfer' || k === 'transfer_arrival' || k === 'transfer_departure') {
    return 'transfer';
  }
  if (k === 'tour' || k === 'multi_day_tour') return 'tour';
  if (k === 'day_tour' || k === 'daytour') return 'day_tour';
  return 'transfer';
}

/** Map new-booking UI tab to DB `kind` / `booking_type`. */
export function bookingKindFromUi(ui: 'transfer' | 'tour' | 'dayTour'): DbCanonicalKind {
  if (ui === 'transfer') return 'transfer';
  if (ui === 'tour') return 'tour';
  return 'day_tour';
}

/** Strict DB columns: always canonical; arrival/departure nuance lives in `flight_direction`. */
export function resolveBookingTypeForInsert(
  canonicalKind: DbCanonicalKind,
): DbCanonicalKind {
  return canonicalKind;
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
    .select('id, is_verified, avatar_url, is_guide_driver')
    .in('id', [...ids]);

  if (error) {
    if (__DEV__) {
      console.warn('[bookings] enrichBookingsWithUserVerification', error.message);
    }
    return rows;
  }

  const verifiedById = new Map<string, boolean>();
  const guideById = new Map<string, boolean>();
  const avatarById = new Map<string, string | null>();
  for (const row of data ?? []) {
    const u = row as {
      id: string;
      is_verified?: boolean | null;
      is_guide_driver?: boolean | null;
      avatar_url?: string | null;
    };
    verifiedById.set(String(u.id), !!u.is_verified);
    guideById.set(String(u.id), u.is_guide_driver === true);
    const url = u.avatar_url?.trim() ?? '';
    avatarById.set(String(u.id), url || null);
  }

  return rows.map((row) => ({
    ...row,
    driver_is_verified: row.driver_id
      ? (verifiedById.get(trimUserId(row.driver_id)) ?? false)
      : null,
    driver_is_guide_driver: row.driver_id
      ? guideById.get(trimUserId(row.driver_id)) ?? false
      : null,
    company_is_verified: verifiedById.get(trimUserId(row.company_id)) ?? false,
    driver_avatar_url: row.driver_id
      ? (avatarById.get(trimUserId(row.driver_id)) ?? null)
      : null,
    company_avatar_url: avatarById.get(trimUserId(row.company_id)) ?? null,
  }));
}

async function enrichBookingsWithHostInfo(rows: BookingRow[]): Promise<BookingRow[]> {
  if (rows.length === 0) return rows;

  const subsNeedingHost: string[] = [];
  for (const row of rows) {
    if (!trimUserId(row.host_driver_id) && trimUserId(row.driver_id)) {
      subsNeedingHost.push(trimUserId(row.driver_id)!);
    }
  }

  const hostIdBySub = new Map<string, string>();
  if (subsNeedingHost.length > 0) {
    const { data: fleet, error: fleetErr } = await supabase
      .from('driver_fleet')
      .select('sub_driver_id, host_driver_id')
      .in('sub_driver_id', [...new Set(subsNeedingHost)])
      .eq('status', 'accepted');
    if (fleetErr && __DEV__) {
      console.warn('[bookings] enrichBookingsWithHostInfo fleet', fleetErr.message);
    }
    for (const f of fleet ?? []) {
      const sub = trimUserId((f as { sub_driver_id: string }).sub_driver_id);
      const host = trimUserId((f as { host_driver_id: string }).host_driver_id);
      if (sub && host) hostIdBySub.set(sub, host);
    }
  }

  const hostIds = new Set<string>();
  const withHostId = rows.map((row) => {
    let hid = trimUserId(row.host_driver_id);
    if (!hid) {
      const did = trimUserId(row.driver_id);
      if (did) {
        const fromFleet = hostIdBySub.get(did);
        if (fromFleet) hid = fromFleet;
      }
    }
    if (hid) hostIds.add(hid);
    return hid && hid !== row.host_driver_id ? { ...row, host_driver_id: hid } : row;
  });

  if (hostIds.size === 0) return withHostId;

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', [...hostIds]);

  if (error) {
    if (__DEV__) console.warn('[bookings] enrichBookingsWithHostInfo', error.message);
    return withHostId;
  }

  const nameById = new Map<string, string>();
  for (const row of data ?? []) {
    const u = row as { id: string; full_name?: string | null };
    const name = u.full_name?.trim();
    if (name) nameById.set(String(u.id), name);
  }

  return withHostId.map((row) => {
    const hid = trimUserId(row.host_driver_id);
    if (!hid) return row;
    return {
      ...row,
      host_display_name: nameById.get(hid) ?? row.host_display_name ?? null,
    };
  });
}

export async function enrichBookingsForList(rows: BookingRow[]): Promise<BookingRow[]> {
  return enrichBookingsWithHostInfo(await enrichBookingsWithUserVerification(rows));
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

function isTourServiceKind(kind: DbCanonicalKind | BookingType | string): boolean {
  const canonical = normalizeBookingKind(kind);
  return canonical === 'tour' || canonical === 'day_tour';
}

/** Tours that require odometer photos at start/end (not transfers). */
export function isTourBookingKind(kind: BookingType | string): boolean {
  return isTourServiceKind(kind);
}

function isBookingsKindConstraintError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('bookings_kind_check') ||
    (m.includes('check constraint') && m.includes('kind') && !m.includes('booking_type'))
  );
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

/** Multi-day tour calendar (stored in `tour_days` jsonb). */
export type TourDayPersisted = {
  day: number;
  date: string;
  fromPlace: string;
  toPlace: string;
  stops: string | string[];
  touristHotel?: string;
  driverOvernight?: string;
  /** @deprecated legacy flag */
  overnight?: boolean;
  /** @deprecated legacy id */
  id?: string;
};

/** Arrival / departure transfer leg (stored in `transfer_in` / `transfer_out` jsonb). */
export type TourTransferLeg = {
  date: string;
  airport?: string;
  airport_type?: string | null;
  hotel?: string;
  hotel_type?: string | null;
  flight?: string;
  passengerName?: string;
};

export type BookingRow = {
  id: string;
  created_at: string;
  updated_at: string;
  company_id: string;
  driver_id: string | null;
  /** Vehicle assigned for this booking (voucher / plate). */
  vehicle_id?: string | null;
  status: BookingStatus;
  kind: BookingType;
  from_location: string | null;
  from_location_type?: string | null;
  to_location: string | null;
  to_location_type?: string | null;
  route: string | null;
  date_display: string | null;
  passengers: number;
  vehicle_type: string | null;
  /** Null = any class (matches all drivers for that `vehicle_type`). */
  vehicle_class: string | null;
  flight_number: string | null;
  meet_greet: boolean | null;
  sign_text: string | null;
  pickup_sign_logo_url: string | null;
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
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  payment_confirmed_by?: string | null;
  price_gel: number;
  /** Host-set pay for fleet sub-driver (snapshot at assignment). */
  driver_payout_gel?: number | null;
  /** Populated when listing bookings for companies (driver bank account). */
  driver_bank_account?: string | null;
  company_name: string | null;
  driver_display_name: string | null;
  driver_phone: string | null;
  driver_plate: string | null;
  /** Host who accepted and delegated to a sub driver. */
  host_driver_id?: string | null;
  host_display_name?: string | null;
  /** Set on insert; optional when row predates column. */
  voucher_code?: string | null;
  requested_driver_category?: RequestedDriverCategory | string | null;
  /** Tour operator / staff name who created the booking. */
  created_by_name?: string | null;
  /** Populated by `enrichBookingsWithUserVerification` when listing bookings. */
  driver_is_verified?: boolean | null;
  driver_is_guide_driver?: boolean | null;
  company_is_verified?: boolean | null;
  driver_avatar_url?: string | null;
  company_avatar_url?: string | null;
  driver_update_pending?: boolean | null;
  update_change_summary?: Record<string, { old: string; new: string; label: string }> | null;
  reminder_24h_sent?: boolean | null;
  reminder_1h_sent?: boolean | null;
  driver_confirmed_1h?: boolean | null;
  reminder_1h_sent_at?: string | null;
  company_unconfirmed_alert_sent?: boolean | null;
  odometer_start_photo_url?: string | null;
  odometer_start_at?: string | null;
  odometer_end_photo_url?: string | null;
  odometer_end_at?: string | null;
};

export type InsertBookingInput = {
  /** Supabase Auth user id — maps to column `company_id`. */
  company_id: string;
  company_name: string | null;
  kind: BookingType;
  from_location: string | null;
  from_location_type?: string | null;
  to_location: string | null;
  to_location_type?: string | null;
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
  /** Resolved on insert/accept from booking vehicle_type/class. */
  vehicle_id?: string | null;
  /** Driver must speak at least one of these language codes (empty = any). */
  required_languages?: string[] | null;
  /** Open-job driver category filter (`all` | `guide` | `own_vehicle`). */
  requested_driver_category?: RequestedDriverCategory | null;
};

/** Localized booking status label */
export function bookingStatusLabel(status: BookingStatus): string {
  const key = `booking.status.${status}`;
  if (i18n.exists(key)) return i18n.t(key);
  return status;
}

export { bookingKindLabel, bookingTypeLabel, resolveBookingKindLabelCode } from './bookingLabels';
export {
  uploadPickupSignLogo,
  setBookingPickupSignLogoUrl,
  type PickupSignLogoFile,
} from './pickupSignLogo';

export function routeSummary(row: BookingRow): string {
  if (isTransferKind(row.kind)) {
    const line = formatLocationRoute(
      row.from_location,
      row.from_location_type,
      row.to_location,
      row.to_location_type,
    );
    if (line !== '—') return line;
  }
  const from = row.from_location?.trim();
  const to = row.to_location?.trim();
  if (from && to) return `${from} → ${to}`;
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
    data: await enrichBookingsForList(hydrateBookingRows(data ?? [])),
    error,
  };
}

/** Bookings delegated by this host to fleet sub-drivers. */
export async function fetchBookingsForHost(hostDriverId: string) {
  const id = trimUserId(hostDriverId);
  if (!id) {
    return { data: [] as BookingRow[], error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('host_driver_id', id)
    .order('updated_at', { ascending: false });
  return {
    data: await enrichBookingsForList(hydrateBookingRows(data ?? [])),
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
    data: await enrichBookingsForList(hydrateBookingRows(data ?? [])),
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

  const { data: driverUserRow } = await supabase
    .from('users')
    .select('is_guide_driver, is_hired_driver')
    .eq('id', id)
    .maybeSingle();
  const driverFlags = (driverUserRow ?? {}) as {
    is_guide_driver?: boolean | null;
    is_hired_driver?: boolean | null;
  };

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
      requested_driver_category?: string | null;
    };
    const rowDriverId = row.driver_id != null ? String(row.driver_id).trim() : '';
    if (rowDriverId && rowDriverId !== id) {
      return false;
    }
    if (
      !rowDriverId &&
      !driverMatchesRequestedCategory(
        driverFlags,
        normalizeRequestedDriverCategory(row.requested_driver_category),
      )
    ) {
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
  let assignedVehicleId: string | null = row.vehicle_id?.trim() || null;
  if (assignedDriverId && !assignedVehicleId) {
    assignedVehicleId = await resolveVehicleIdForBooking({
      driverId: assignedDriverId,
      vehicleType,
      vehicleClass,
    });
  }

  function buildBookingInsertBody(
    routeCol: 'route' | 'route_description',
    canonicalKind: DbCanonicalKind,
    opts: { includeTourColumns: boolean; includeKindColumn: boolean },
  ): Record<string, unknown> {
    const bookingTypeForDb = resolveBookingTypeForInsert(canonicalKind);
    const body: Record<string, unknown> = {
      company_id: companyUserId,
      voucher_code: voucherCode,
      company_name: row.company_name,
      booking_type: bookingTypeForDb,
      from_location: row.from_location,
      from_location_type: row.from_location_type ?? null,
      to_location: row.to_location,
      to_location_type: row.to_location_type ?? null,
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
      vehicle_id: assignedDriverId ? assignedVehicleId : null,
      required_languages: (() => {
        const codes = sanitizeLanguageCodes(row.required_languages ?? []);
        return codes.length > 0 ? codes : null;
      })(),
      requested_driver_category: normalizeRequestedDriverCategory(
        row.requested_driver_category ?? 'all',
      ),
    };

    if (opts.includeKindColumn) {
      body.kind = canonicalKind;
    }

    if (opts.includeTourColumns && isTourServiceKind(canonicalKind)) {
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
    canonicalKind: DbCanonicalKind,
    includeTourColumns: boolean,
    includeKindColumn: boolean,
  ) {
    for (let r = 0; r < 2; r++) {
      const routeCol = r === 0 ? ('route' as const) : ('route_description' as const);
      const payload = buildBookingInsertBody(routeCol, canonicalKind, {
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
    canonicalKind: DbCanonicalKind,
    initialTourCols: boolean,
    initialKindCol: boolean,
  ) {
    let tourCols = initialTourCols;
    let kindCol = initialKindCol;
    let res = await tryInsertRouteVariants(canonicalKind, tourCols, kindCol);

    if (res.error && tourCols && shouldRetryBookingInsertWithoutTourColumns(res.error.message)) {
      tourCols = false;
      res = await tryInsertRouteVariants(canonicalKind, tourCols, kindCol);
    }
    if (res.error && kindCol && shouldRetryBookingInsertWithoutKindColumn(res.error.message)) {
      kindCol = false;
      res = await tryInsertRouteVariants(canonicalKind, tourCols, kindCol);
    }
    return res;
  }

  let dbKind = kind;
  let result = await runWithStrippedTourAndKindOptions(dbKind, isTourServiceKind(dbKind), true);

  if (
    result.error &&
    kind === 'day_tour' &&
    dbKind === 'day_tour' &&
    (isBookingsBookingTypeConstraintError(result.error.message) ||
      isBookingsKindConstraintError(result.error.message))
  ) {
    dbKind = 'tour';
    result = await runWithStrippedTourAndKindOptions(dbKind, isTourServiceKind(kind), true);
  }

  const { data, error } = result;

  if (error) {
    return { id: undefined, error: new Error(error.message) };
  }

  const bookingId = data?.id as string | undefined;
  if (bookingId && assignedDriverId) {
    void maybeAutoAcceptHiredAssignedBooking(bookingId, assignedDriverId);
  }
  if (bookingId) {
    void notifyMatchingDriversOfNewBooking({
      kind,
      vehicleType,
      vehicleClass: vehicleClass ?? undefined,
      driverId: assignedDriverId || undefined,
      bookingId,
      showAlertIfEmpty: true,
      requiredLanguages: row.required_languages ?? undefined,
      requestedDriverCategory: normalizeRequestedDriverCategory(
        row.requested_driver_category ?? 'all',
      ),
      detailBody:
        kind === 'tour'
          ? formatTourBookingNotificationBody({
              tour_days: row.tour_days,
              transfer_in: row.transfer_in,
              transfer_out: row.transfer_out,
            })
          : undefined,
      availability: {
        kind,
        date_display: row.date_display,
        itinerary: row.itinerary,
        tour_days: row.tour_days,
        transfer_in: row.transfer_in,
        transfer_out: row.transfer_out,
      },
    });
    if (assignedDriverId) {
      void notifyBookingVoucherCreated({
        bookingId,
        driverUserId: assignedDriverId,
        companyUserId,
        voucherCode,
        kind,
        route: row.route,
        from_location: row.from_location,
        to_location: row.to_location,
        tour_days: row.tour_days,
        transfer_in: row.transfer_in,
        transfer_out: row.transfer_out,
      });
    }
  }

  return { id: bookingId, error: null };
}

async function maybeAutoAcceptHiredAssignedBooking(
  bookingId: string,
  driverUserId: string,
): Promise<void> {
  const hired = await isHiredOrFleetSubDriver(driverUserId);
  if (!hired) return;

  const { data: user } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', driverUserId)
    .maybeSingle();

  const { data: fleet } = await supabase
    .from('driver_fleet')
    .select('vehicle_id')
    .eq('sub_driver_id', driverUserId)
    .eq('status', 'accepted')
    .maybeSingle();

  let plate = '';
  const fleetVehicleId = (fleet as { vehicle_id?: string } | null)?.vehicle_id?.trim();
  if (fleetVehicleId) {
    const { data: fleetVehicle } = await supabase
      .from('vehicles')
      .select('plate')
      .eq('id', fleetVehicleId)
      .maybeSingle();
    plate = (fleetVehicle as { plate?: string | null } | null)?.plate?.trim() ?? '';
  }
  if (!plate) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('plate')
      .eq('driver_id', driverUserId)
      .eq('is_active', true)
      .maybeSingle();
    plate = (vehicle as { plate?: string | null } | null)?.plate?.trim() ?? '';
  }

  const displayName =
    (user as { full_name?: string | null } | null)?.full_name?.trim() || 'Driver';

  await acceptBooking(bookingId, {
    driverId: driverUserId,
    displayName,
    phone: '',
    plate,
    vehicleId: fleetVehicleId || null,
  });
}

export async function acceptBooking(
  /** `bookings.id` (uuid) */
  bookingRowId: string,
  driver: {
    driverId: string;
    displayName: string;
    phone: string;
    plate: string;
    /** Fleet-assigned vehicle or explicit pick. */
    vehicleId?: string | null;
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

  const { data: pendingRow } = await supabase
    .from('bookings')
    .select('vehicle_type, vehicle_class, vehicle_id')
    .eq('id', rowId)
    .maybeSingle();

  const pending = pendingRow as {
    vehicle_type?: string | null;
    vehicle_class?: string | null;
    vehicle_id?: string | null;
  } | null;

  const acceptVehicleId = await resolveVehicleIdForBooking({
    driverId: driverUserId,
    vehicleType: pending?.vehicle_type ?? null,
    vehicleClass: pending?.vehicle_class ?? null,
    preferredVehicleId: driver.vehicleId ?? pending?.vehicle_id ?? null,
  });

  const runAccept = (assignStatus: 'accepted' | 'confirmed') =>
    supabase
      .from('bookings')
      .update({
        driver_id: driverUserId,
        status: assignStatus,
        driver_display_name: driver.displayName,
        driver_phone: driver.phone || null,
        driver_plate: driver.plate || null,
        vehicle_id: acceptVehicleId,
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
  if (companyUid) void notifyCompanyBookingAccepted({
    companyUserId: companyUid,
    bookingId: rowId,
    driverName: driver.displayName || undefined,
    driverPhone: driver.phone || undefined,
    driverPlate: driver.plate || undefined,
  });
  return { ok: true as const, error: null };
}

/** Host accepts open booking and assigns to an accepted fleet sub-driver. */
export async function hostAcceptBookingForSub(
  bookingRowId: string,
  hostDriverId: string,
  subDriverId: string,
  subDriver: {
    displayName: string;
    phone: string;
    plate: string;
    driverPayoutGel: number;
  },
) {
  const rowId = String(bookingRowId).trim();
  const hostId = trimUserId(hostDriverId);
  const subId = trimUserId(subDriverId);
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('booking id უნდა იყოს ჯავშნის uuid') };
  }
  if (!hostId || !subId) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const { data: fleetRow, error: fleetErr } = await supabase
    .from('driver_fleet')
    .select('id')
    .eq('host_driver_id', hostId)
    .eq('sub_driver_id', subId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (fleetErr) return { ok: false as const, error: new Error(fleetErr.message) };
  if (!fleetRow) {
    return { ok: false as const, error: new Error('მძღოლი არ არის თქვენს ფლოტში') };
  }

  const payout = Number(subDriver.driverPayoutGel);
  if (!Number.isFinite(payout) || payout <= 0) {
    return { ok: false as const, error: new Error('მძღოლის ხელფასი არასწორია') };
  }

  const { data: priceRow } = await supabase
    .from('bookings')
    .select('price_gel')
    .eq('id', rowId)
    .maybeSingle();
  const tripTotal = Number((priceRow as { price_gel?: number } | null)?.price_gel ?? 0);
  if (Number.isFinite(tripTotal) && tripTotal > 0 && payout > tripTotal) {
    return {
      ok: false as const,
      error: new Error('მძღოლის ხელფასი ვერ აღემატება ჯავშნის ფასს'),
    };
  }

  const runAccept = (assignStatus: 'accepted' | 'confirmed') =>
    supabase
      .from('bookings')
      .update({
        driver_id: subId,
        host_driver_id: hostId,
        status: assignStatus,
        driver_display_name: subDriver.displayName,
        driver_phone: subDriver.phone || null,
        driver_plate: subDriver.plate || null,
        driver_payout_gel: payout,
      })
      .eq('id', rowId)
      .eq('status', 'pending')
      .is('driver_id', null)
      .select('id, voucher_code, route, from_location, to_location, kind, tour_days, transfer_in, transfer_out')
      .maybeSingle();

  let { data, error } = await runAccept('accepted');
  if (error && isBookingsStatusConstraintError(error)) {
    ({ data, error } = await runAccept('confirmed'));
  }

  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი უკვე აღებულია ან მიუწვდომელია') };
  }

  void createScheduleForAcceptedBooking(rowId, subId);
  void notifyBookingConfirmed();

  const row = data as {
    voucher_code?: string | null;
    route?: string | null;
    from_location?: string | null;
    to_location?: string | null;
  };
  const routeLine =
    row.route?.trim() ||
    [row.from_location, row.to_location].filter((x) => x?.trim()).join(' → ') ||
    '';

  void notifyBookingAssignedByHost({
    subDriverId: subId,
    hostDriverId: hostId,
    bookingId: rowId,
    routeSummary: routeLine,
    voucherCode: row.voucher_code?.trim(),
    driverPayoutGel: payout,
  });

  const { data: companyRow } = await supabase
    .from('bookings')
    .select('company_id')
    .eq('id', rowId)
    .maybeSingle();
  const companyUid = String((companyRow as { company_id?: string | null } | null)?.company_id ?? '').trim();
  if (companyUid) {
    void notifyCompanyBookingAccepted({
      companyUserId: companyUid,
      bookingId: rowId,
      driverName: subDriver.displayName || undefined,
      driverPhone: subDriver.phone || undefined,
      driverPlate: subDriver.plate || undefined,
    });
  }

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

  const { data: rpcOk, error: rpcError } = await supabase.rpc(
    'reject_pending_booking_as_driver',
    { p_booking_id: rowId },
  );

  if (!rpcError && rpcOk === true) {
    return { ok: true as const, error: null };
  }

  if (rpcError) {
    const missingRpc =
      rpcError.message.includes('reject_pending_booking_as_driver') ||
      rpcError.code === 'PGRST202';
    if (!missingRpc) {
      if (__DEV__) {
        console.warn('[rejectBooking] rpc:', rpcError.message, { rowId });
      }
      return { ok: false as const, error: rpcError };
    }
    if (__DEV__) {
      console.warn('[rejectBooking] rpc missing, falling back to direct update');
    }
  } else if (rpcOk === false) {
    return {
      ok: false as const,
      error: new Error('ჯავშანი უკვე აღებულია ან მიუწვდომელია'),
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
    .eq('status', 'pending')
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

  const { data: beforeRow } = await supabase
    .from('bookings')
    .select('host_driver_id, driver_display_name, route, from_location, to_location')
    .eq('id', rowId)
    .maybeSingle();

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
    const row = beforeRow as {
      host_driver_id?: string | null;
      driver_display_name?: string | null;
      route?: string | null;
      from_location?: string | null;
      to_location?: string | null;
    } | null;
    const hostId = trimUserId(row?.host_driver_id ?? '');
    if (hostId) {
      const routeLine =
        row?.route?.trim() ||
        [row?.from_location, row?.to_location].filter((x) => x?.trim()).join(' → ') ||
        '';
      void notifyHostTourCompleted({
        hostDriverId: hostId,
        bookingId: rowId,
        driverName: row?.driver_display_name?.trim() || undefined,
        routeSummary: routeLine || undefined,
      });
    }
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

/** Driver or host cancels after accept (accepted / in_progress → cancelled). */
export async function cancelBookingByDriver(bookingRowId: string, driverUserId: string) {
  const rowId = String(bookingRowId).trim();
  if (!isBookingRowUuid(rowId)) {
    return { ok: false as const, error: new Error('invalid booking id') };
  }
  const uid = trimUserId(driverUserId);
  if (!uid) {
    return { ok: false as const, error: new Error('მძღოლის id არ არის') };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, status, company_id, driver_id, host_driver_id, route, from_location, to_location, driver_display_name',
    )
    .eq('id', rowId)
    .maybeSingle();

  if (fetchErr) return { ok: false as const, error: fetchErr };
  if (!existing) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ მოიძებნა') };
  }

  const row = existing as {
    status?: string;
    company_id?: string;
    driver_id?: string | null;
    host_driver_id?: string | null;
    route?: string | null;
    from_location?: string | null;
    to_location?: string | null;
    driver_display_name?: string | null;
  };

  const status = String(row.status ?? '').toLowerCase();
  if (status !== 'accepted' && status !== 'confirmed' && status !== 'in_progress') {
    return {
      ok: false as const,
      error: new Error('გაუქმება მხოლოდ მიღებული ან მიმდინარე ჯავშნისთვისაა'),
    };
  }

  const driverId = trimUserId(row.driver_id ?? '');
  const hostId = trimUserId(row.host_driver_id ?? '');
  if (driverId !== uid && hostId !== uid) {
    return { ok: false as const, error: new Error('ჯავშანი თქვენზე არ არის მინიჭებული') };
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', rowId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error };
  if (!data) {
    return { ok: false as const, error: new Error('ჯავშანი ვერ გაუქმდა') };
  }

  void releaseDriverScheduleForBooking(rowId);

  const companyUid = trimUserId(row.company_id ?? '');
  const routeLine =
    row.route?.trim() ||
    [row.from_location, row.to_location].filter((x) => x?.trim()).join(' → ') ||
    '';
  if (companyUid) {
    void notifyCompanyDriverCancelledBooking({
      companyUserId: companyUid,
      bookingId: rowId,
      driverName: row.driver_display_name?.trim() || undefined,
      routeSummary: routeLine,
    });
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
    .select('price_gel, driver_payout_gel, host_driver_id, driver_id, status')
    .eq('driver_id', id);
  if (error || !data) return { completed: 0, earnings: 0, error };
  const rows = data as {
    price_gel: number;
    driver_payout_gel?: number | null;
    host_driver_id?: string | null;
    driver_id?: string | null;
    status: BookingStatus;
  }[];
  const completed = rows.filter((r) => r.status === 'completed').length;
  const earnings = rows
    .filter((r) => r.status === 'completed')
    .reduce(
      (s, r) =>
        s +
        completedDriverEarningsGel(
          {
            price_gel: r.price_gel,
            driver_payout_gel: r.driver_payout_gel,
            host_driver_id: r.host_driver_id,
            driver_id: r.driver_id ?? null,
          },
          id,
        ),
      0,
    );
  return { completed, earnings, error: null };
}

/** Host net from fleet-delegated completed trips. */
export async function aggregateHostFleetStats(hostDriverId: string) {
  const id = trimUserId(hostDriverId);
  if (!id) {
    return { completed: 0, earnings: 0, error: null };
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('price_gel, driver_payout_gel, status')
    .eq('host_driver_id', id);
  if (error || !data) return { completed: 0, earnings: 0, error };
  const rows = data as {
    price_gel: number;
    driver_payout_gel?: number | null;
    status: BookingStatus;
  }[];
  const completedRows = rows.filter((r) => r.status === 'completed');
  const earnings = completedRows.reduce((s, r) => s + hostNetGel(r), 0);
  return { completed: completedRows.length, earnings, error: null };
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
