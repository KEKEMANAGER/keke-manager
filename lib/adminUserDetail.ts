import type { KekeRole } from '../contexts/AuthContext';
import type { Profile } from '../contexts/AuthContext';
import type { BookingRow } from './bookings';
import { fetchFleetForHost, type FleetMemberView } from './fleet';
import { withCacheBust } from './mediaUpload';
import { fetchDriverAverageRating } from './ratings';
import { supabase } from './supabase';
import { VERIFICATION_DOC_COLUMNS } from './verificationDocs';
import { fetchVehiclesByDriver, type VehicleRow } from './vehicles';
import { sanitizeLanguageCodes } from './spokenLanguages';
import { DRIVER_KYC_DOC_SLOTS } from './verificationDocs';

export type AdminUserKind =
  | 'company'
  | 'driver_host'
  | 'driver_hired'
  | 'driver_guide'
  | 'admin';

export type AdminUserDetailUser = Profile & {
  is_blocked: boolean | null;
  tax_id: string | null;
  license_front: string | null;
  license_back: string | null;
  tech_passport_front: string | null;
  tech_passport_back: string | null;
  id_front: string | null;
  id_back: string | null;
};

export type AdminUserBookingStats = {
  total: number;
  completed: number;
  cancelled: number;
  revenueGel: number;
};

export type AdminRatingRow = {
  id: string;
  overall: number;
  comment: string | null;
  created_at: string | null;
  booking_id: string;
};

export type AdminFleetSubInfo = {
  fleetId: string;
  status: string;
  created_at: string;
  host: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
  vehicle: VehicleRow | null;
};

export type AdminUserDetail = {
  user: AdminUserDetailUser;
  kind: AdminUserKind;
  vehicles: VehicleRow[];
  fleetMembers: FleetMemberView[];
  fleetAsSub: AdminFleetSubInfo | null;
  stats: AdminUserBookingStats;
  recentBookings: BookingRow[];
  ratingAverage: number;
  ratingCount: number;
  recentRatings: AdminRatingRow[];
  lastActivityAt: string | null;
};

const ADMIN_USER_SELECT = `id, role, full_name, email, phone, avatar_url, bio, languages, balance, rating, is_verified, verification_status, subscription_type, subscription_expires_at, created_at, experience_years, license_photo, id_photo, vehicle_registration_photo, rejection_reason, is_hired_driver, is_guide_driver, available_for_hire, company_email, company_phone, company_id_code, company_director, city, is_blocked, tax_id, ${VERIFICATION_DOC_COLUMNS}`;

function bustUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return withCacheBust(url.trim()) ?? url.trim();
}

export function classifyAdminUser(u: {
  role: string | null;
  is_hired_driver: boolean | null;
  is_guide_driver: boolean | null;
}): AdminUserKind {
  if (u.role === 'company') return 'company';
  if (u.role === 'admin') return 'admin';
  if (u.is_hired_driver) return 'driver_hired';
  if (u.is_guide_driver) return 'driver_guide';
  return 'driver_host';
}

function computeBookingStats(rows: BookingRow[]): AdminUserBookingStats {
  let completed = 0;
  let cancelled = 0;
  let revenueGel = 0;
  for (const b of rows) {
    if (b.status === 'completed') {
      completed++;
      revenueGel += Number(b.price_gel) || 0;
    } else if (b.status === 'cancelled' || b.status === 'rejected') {
      cancelled++;
    }
  }
  return { total: rows.length, completed, cancelled, revenueGel };
}

async function fetchBookingsForUser(userId: string, role: string | null): Promise<BookingRow[]> {
  let query = supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(200);

  if (role === 'company') {
    query = query.eq('company_id', userId);
  } else if (role === 'driver') {
    query = query.or(`driver_id.eq.${userId},host_driver_id.eq.${userId}`);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as BookingRow[];
}

async function fetchFleetSubInfo(subDriverId: string): Promise<AdminFleetSubInfo | null> {
  const { data: row } = await supabase
    .from('driver_fleet')
    .select('id, host_driver_id, vehicle_id, status, created_at')
    .eq('sub_driver_id', subDriverId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return null;

  const fleet = row as {
    id: string;
    host_driver_id: string;
    vehicle_id: string;
    status: string;
    created_at: string;
  };

  const [{ data: host }, { data: vehicle }] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email, phone')
      .eq('id', fleet.host_driver_id)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select(
        'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,is_verified,updated_at',
      )
      .eq('id', fleet.vehicle_id)
      .maybeSingle(),
  ]);

  const h = host as { id: string; full_name: string | null; email: string | null; phone: string | null } | null;

  return {
    fleetId: fleet.id,
    status: fleet.status,
    created_at: fleet.created_at,
    host: {
      id: fleet.host_driver_id,
      full_name: h?.full_name ?? null,
      email: h?.email ?? null,
      phone: h?.phone ?? null,
    },
    vehicle: vehicle ? bustVehicle(vehicle as VehicleRow) : null,
  };
}

function bustVehicle(v: VehicleRow): VehicleRow {
  return {
    ...v,
    photo_front: bustUrl(v.photo_front),
    photo_left: bustUrl(v.photo_left),
    photo_right: bustUrl(v.photo_right),
    photo_interior: bustUrl(v.photo_interior),
    photo_rear: bustUrl(v.photo_rear),
  };
}

export function formatAdminUserLanguages(languages: unknown | null): string {
  const raw = Array.isArray(languages)
    ? languages.filter((x): x is string => typeof x === 'string')
    : [];
  const codes = sanitizeLanguageCodes(raw);
  return codes.length > 0 ? codes.join(', ').toUpperCase() : '—';
}

export function adminUserDocUrls(user: AdminUserDetailUser): { key: string; url: string }[] {
  const slots = DRIVER_KYC_DOC_SLOTS;

  const legacy: Record<string, string | null> = {
    license_photo: user.license_photo,
    id_photo: user.id_photo,
    vehicle_registration_photo: user.vehicle_registration_photo,
  };

  const out: { key: string; url: string }[] = [];
  for (const key of slots) {
    const url = bustUrl((user as Record<string, string | null>)[key] ?? legacy[key] ?? null);
    if (url) out.push({ key, url });
  }
  return out;
}

export async function fetchAdminUserDetail(userId: string): Promise<{
  data: AdminUserDetail | null;
  error: Error | null;
}> {
  const id = userId.trim();
  if (!id) return { data: null, error: new Error('user id missing') };

  const { data: raw, error: userErr } = await supabase
    .from('users')
    .select(ADMIN_USER_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (userErr) return { data: null, error: new Error(userErr.message) };
  if (!raw) return { data: null, error: new Error('User not found') };

  const row = raw as Record<string, unknown>;
  const user = {
    ...(row as AdminUserDetailUser),
    avatar_url: bustUrl(row.avatar_url as string | null),
    license_photo: bustUrl(row.license_photo as string | null),
    id_photo: bustUrl(row.id_photo as string | null),
    vehicle_registration_photo: bustUrl(row.vehicle_registration_photo as string | null),
    license_front: bustUrl(row.license_front as string | null),
    license_back: bustUrl(row.license_back as string | null),
    tech_passport_front: bustUrl(row.tech_passport_front as string | null),
    tech_passport_back: bustUrl(row.tech_passport_back as string | null),
    id_front: bustUrl(row.id_front as string | null),
    id_back: bustUrl(row.id_back as string | null),
    role: (row.role as KekeRole | null) ?? null,
  } satisfies AdminUserDetailUser;

  const kind = classifyAdminUser(user);
  const isDriver = user.role === 'driver';
  const isHired = !!user.is_hired_driver;
  const isHostDriver = isDriver && !isHired;

  const [bookings, ratingRes, ratingsRecentRes, vehiclesRes, fleetHostRes, fleetSub] = await Promise.all([
    fetchBookingsForUser(id, user.role),
    isDriver ? fetchDriverAverageRating(id) : Promise.resolve({ average: 0, count: 0, error: null }),
    isDriver
      ? supabase
          .from('ratings')
          .select('id, overall, comment, created_at, booking_id')
          .eq('driver_id', id)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    isHostDriver ? fetchVehiclesByDriver(id) : Promise.resolve({ data: [], error: null }),
    isHostDriver ? fetchFleetForHost(id, { includePending: true }) : Promise.resolve({ data: [], error: null }),
    isHired ? fetchFleetSubInfo(id) : Promise.resolve(null),
  ]);

  const allBookings = bookings;
  const stats = computeBookingStats(allBookings);
  const recentBookings = allBookings.slice(0, 10);
  const lastActivityAt =
    allBookings[0]?.created_at ??
    (ratingsRecentRes.data as AdminRatingRow[] | null)?.[0]?.created_at ??
    user.created_at;

  const vehicles = (vehiclesRes.data ?? []).map(bustVehicle);
  const recentRatings = (ratingsRecentRes.data ?? []) as AdminRatingRow[];

  return {
    data: {
      user,
      kind,
      vehicles,
      fleetMembers: fleetHostRes.data ?? [],
      fleetAsSub: fleetSub,
      stats,
      recentBookings,
      ratingAverage: ratingRes.average,
      ratingCount: ratingRes.count,
      recentRatings,
      lastActivityAt: lastActivityAt ?? null,
    },
    error: null,
  };
}
