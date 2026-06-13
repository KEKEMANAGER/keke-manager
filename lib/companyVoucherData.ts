import type { BookingRow } from './bookings';
import { enrichBookingsForList, fetchBookingById } from './bookings';
import { fetchConvoyPeerLegs, type ConvoyPeerLeg } from './convoyPeers';
import { fetchLegsForMaster } from './groupBooking';
import { fetchDriverAverageRating } from './ratings';
import { resolveProfileAvatarUrl } from './profileAvatar';
import { formatSpokenLanguagesList, sanitizeLanguageCodes } from './spokenLanguages';
import { supabase } from './supabase';
import { trimUserId } from './userId';
import { fetchVehicleMakeById, fetchVehicleModelById } from './vehicleData';
import { allVehiclePhotoUrls, firstVehiclePhotoUrl } from './vehiclePhotos';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  vehicleClassLabel,
  vehicleTypeLabel,
} from './vehicleCatalog';
import { resolveVehicleIdForBooking } from './bookingVehicle';
import { fetchActiveVehiclesByDriver, type VehicleRow } from './vehicles';

export type CompanyVoucherDriver = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  bankAccount: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  isGuideDriver: boolean;
  ratingAverage: number;
  ratingCount: number;
  languagesLabel: string | null;
  languageCodes: string[];
  city: string | null;
};

export type CompanyVoucherVehicle = {
  photoUrls: string[];
  mainPhotoUrl: string | null;
  makeName: string | null;
  modelName: string | null;
  year: number | null;
  plate: string | null;
  color: string | null;
  typeCode: string | null;
  classCode: string | null;
  typeLabel: string | null;
  classLabel: string | null;
};

export type CompanyVoucherHost = {
  userId: string;
  fullName: string | null;
  phone: string | null;
};

export type CompanyVoucherCompany = {
  userId: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
};

export type CompanyVoucherConvoyLeg = {
  legIndex: number;
  booking: BookingRow;
  driver: CompanyVoucherDriver | null;
  vehicle: CompanyVoucherVehicle | null;
};

export type CompanyVoucherData = {
  booking: BookingRow;
  driver: CompanyVoucherDriver | null;
  vehicle: CompanyVoucherVehicle | null;
  host: CompanyVoucherHost | null;
  company: CompanyVoucherCompany | null;
  /** Large-group master: one voucher listing every vehicle + driver. */
  convoyLegs?: CompanyVoucherConvoyLeg[];
  /** Convoy leg on master id — driver-safe peer list (no other drivers' prices). */
  convoyPeerLegs?: ConvoyPeerLeg[];
  convoyMasterId?: string | null;
};

type VehicleJoinRow = VehicleRow & {
  vehicle_makes?: { name?: string | null } | { name?: string | null }[] | null;
  vehicle_models?: { name?: string | null } | { name?: string | null }[] | null;
};

function joinName(
  rel: { name?: string | null } | { name?: string | null }[] | null | undefined,
): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  const name = row?.name?.trim();
  return name || null;
}

const VEHICLE_JOIN_SELECT =
  'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,make_id,model_id,vehicle_makes(name),vehicle_models(name)';

const VEHICLE_PLAIN_SELECT =
  'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,make_id,model_id';

async function fetchVehicleJoinById(vehicleId: string): Promise<VehicleJoinRow | null> {
  const joined = await supabase
    .from('vehicles')
    .select(VEHICLE_JOIN_SELECT)
    .eq('id', vehicleId)
    .maybeSingle();

  if (!joined.error && joined.data) {
    return joined.data as VehicleJoinRow;
  }

  const plain = await supabase
    .from('vehicles')
    .select(VEHICLE_PLAIN_SELECT)
    .eq('id', vehicleId)
    .maybeSingle();

  if (plain.error || !plain.data) return null;
  return plain.data as VehicleJoinRow;
}

async function fetchActiveVehicleForDriver(driverId: string): Promise<VehicleJoinRow | null> {
  const joined = await supabase
    .from('vehicles')
    .select(VEHICLE_JOIN_SELECT)
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!joined.error && joined.data) {
    return joined.data as VehicleJoinRow;
  }

  const plain = await supabase
    .from('vehicles')
    .select(VEHICLE_PLAIN_SELECT)
    .eq('driver_id', driverId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (plain.error || !plain.data) return null;
  return plain.data as VehicleJoinRow;
}

/** Booking vehicle_id → row; else type/class match; else latest active. */
async function fetchVehicleForBooking(
  booking: BookingRow,
  driverId: string | null,
): Promise<VehicleJoinRow | null> {
  const pinnedId = booking.vehicle_id?.trim();
  if (pinnedId) {
    const pinned = await fetchVehicleJoinById(pinnedId);
    if (pinned) return pinned;
  }

  if (!driverId) return null;

  const bookingType = normalizeVehicleType(booking.vehicle_type ?? '');
  const bookingClass = normalizeVehicleClass(booking.vehicle_class ?? '');

  if (bookingType) {
    const { data: vehicles } = await fetchActiveVehiclesByDriver(driverId);
    const matching = vehicles.filter((v) => {
      const vt = normalizeVehicleType(v.type ?? '');
      if (vt !== bookingType) return false;
      const vc = normalizeVehicleClass(v.class ?? '');
      if (bookingClass && vc && vc !== bookingClass) return false;
      return true;
    });
    if (matching[0]?.id) {
      const row = await fetchVehicleJoinById(matching[0].id);
      if (row) return row;
    }
  }

  const resolvedId = await resolveVehicleIdForBooking({
    driverId,
    vehicleType: booking.vehicle_type,
    vehicleClass: booking.vehicle_class,
    preferredVehicleId: pinnedId,
  });
  if (resolvedId) {
    const row = await fetchVehicleJoinById(resolvedId);
    if (row) return row;
  }

  return fetchActiveVehicleForDriver(driverId);
}

async function resolveVehicleLabels(v: VehicleJoinRow): Promise<{
  makeName: string | null;
  modelName: string | null;
}> {
  let makeName = joinName(v.vehicle_makes);
  let modelName = joinName(v.vehicle_models);

  if (!makeName && v.make_id) {
    const make = await fetchVehicleMakeById(v.make_id);
    makeName = make?.name ?? null;
  }
  if (!modelName && v.model_id) {
    const model = await fetchVehicleModelById(v.model_id);
    modelName = model?.name ?? null;
  }

  const textModel = v.model?.trim() || null;
  if (!modelName && textModel) {
    modelName = textModel;
  }

  return { makeName, modelName };
}

function buildVehicle(v: VehicleJoinRow, makeName: string | null, modelName: string | null): CompanyVoucherVehicle {
  const typeCode = normalizeVehicleType(v.type);
  const classCode = normalizeVehicleClass(v.class);
  return {
    photoUrls: allVehiclePhotoUrls(v),
    mainPhotoUrl: firstVehiclePhotoUrl(v),
    makeName,
    modelName,
    year: v.year ?? null,
    plate: v.plate?.trim() || null,
    color: v.color?.trim() || null,
    typeCode: typeCode ?? (v.type?.trim() || null),
    classCode: classCode ?? (v.class?.trim() || null),
    typeLabel: typeCode ? vehicleTypeLabel(typeCode) : v.type?.trim() || null,
    classLabel: classCode ? vehicleClassLabel(classCode) : v.class?.trim() || null,
  };
}

async function fetchDriverBlock(
  driverId: string,
  booking: BookingRow,
): Promise<{ driver: CompanyVoucherDriver; vehicle: CompanyVoucherVehicle | null }> {
  const [userRes, profileRes, ratingRes, vehicleRow] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, phone, bank_account, avatar_url, languages, city, is_verified, is_guide_driver')
      .eq('id', driverId)
      .maybeSingle(),
    supabase.from('profiles').select('full_name, avatar_url').eq('id', driverId).maybeSingle(),
    fetchDriverAverageRating(driverId),
    fetchVehicleForBooking(booking, driverId),
  ]);

  const user = userRes.data as {
    full_name?: string | null;
    phone?: string | null;
    bank_account?: string | null;
    avatar_url?: string | null;
    languages?: string[] | null;
    city?: string | null;
    is_verified?: boolean | null;
    is_guide_driver?: boolean | null;
  } | null;

  const profile = profileRes.data as { full_name?: string | null; avatar_url?: string | null } | null;

  const profileName = profile?.full_name?.trim() || null;
  const userName = user?.full_name?.trim() || null;

  const driver: CompanyVoucherDriver = {
    userId: driverId,
    fullName:
      profileName ||
      userName ||
      booking.driver_display_name?.trim() ||
      null,
    phone: user?.phone?.trim() || booking.driver_phone?.trim() || null,
    bankAccount: user?.bank_account?.trim() || null,
    avatarUrl: resolveProfileAvatarUrl(profile?.avatar_url, user?.avatar_url),
    isVerified: !!user?.is_verified || !!booking.driver_is_verified,
    isGuideDriver: user?.is_guide_driver === true || booking.driver_is_guide_driver === true,
    ratingAverage: ratingRes.average,
    ratingCount: ratingRes.count,
    languagesLabel: user?.languages?.length ? formatSpokenLanguagesList(user.languages) : null,
    languageCodes: sanitizeLanguageCodes(user?.languages ?? []),
    city: user?.city?.trim() || null,
  };

  let vehicle: CompanyVoucherVehicle | null = null;
  if (vehicleRow) {
    const { makeName, modelName } = await resolveVehicleLabels(vehicleRow);
    vehicle = buildVehicle(vehicleRow, makeName, modelName);
  } else if (booking.driver_plate?.trim()) {
    vehicle = {
      photoUrls: [],
      mainPhotoUrl: null,
      makeName: null,
      modelName: null,
      year: null,
      plate: booking.driver_plate.trim(),
      color: null,
      typeCode: booking.vehicle_type ?? null,
      classCode: booking.vehicle_class ?? null,
      typeLabel: booking.vehicle_type ? vehicleTypeLabel(booking.vehicle_type) : null,
      classLabel: booking.vehicle_class ? vehicleClassLabel(booking.vehicle_class) : null,
    };
  }

  return { driver, vehicle };
}

async function fetchCompanyBlock(
  companyId: string,
  booking: BookingRow,
): Promise<CompanyVoucherCompany> {
  const { data } = await supabase
    .from('users')
    .select('full_name, phone, avatar_url, is_verified')
    .eq('id', companyId)
    .maybeSingle();

  const u = data as {
    full_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    is_verified?: boolean | null;
  } | null;

  return {
    userId: companyId,
    name: u?.full_name?.trim() || booking.company_name?.trim() || null,
    phone: u?.phone?.trim() || null,
    avatarUrl: u?.avatar_url?.trim() || booking.company_avatar_url?.trim() || null,
    isVerified: !!u?.is_verified || !!booking.company_is_verified,
  };
}

async function fetchHostBlock(hostId: string, booking: BookingRow): Promise<CompanyVoucherHost> {
  const { data } = await supabase
    .from('users')
    .select('full_name, phone')
    .eq('id', hostId)
    .maybeSingle();

  const u = data as { full_name?: string | null; phone?: string | null } | null;
  return {
    userId: hostId,
    fullName: u?.full_name?.trim() || booking.host_display_name?.trim() || null,
    phone: u?.phone?.trim() || null,
  };
}

function vehicleFromBookingRow(booking: BookingRow): CompanyVoucherVehicle | null {
  if (!booking.vehicle_type?.trim() && !booking.driver_plate?.trim()) return null;
  const typeCode = normalizeVehicleType(booking.vehicle_type ?? '');
  const classCode = normalizeVehicleClass(booking.vehicle_class ?? '');
  return {
    photoUrls: [],
    mainPhotoUrl: null,
    makeName: null,
    modelName: null,
    year: null,
    plate: booking.driver_plate?.trim() || null,
    color: null,
    typeCode: typeCode ?? booking.vehicle_type?.trim() ?? null,
    classCode: classCode ?? booking.vehicle_class?.trim() ?? null,
    typeLabel: typeCode ? vehicleTypeLabel(typeCode) : booking.vehicle_type?.trim() || null,
    classLabel: classCode ? vehicleClassLabel(classCode) : booking.vehicle_class?.trim() || null,
  };
}

async function buildConvoyLegs(
  masterId: string,
  companyUserId?: string,
): Promise<CompanyVoucherConvoyLeg[]> {
  const { data: legs, error } = await fetchLegsForMaster(masterId, companyUserId);
  if (error || legs.length === 0) return [];

  const enriched = await enrichBookingsForList(legs);
  const out: CompanyVoucherConvoyLeg[] = [];

  for (const leg of enriched) {
    const driverId = trimUserId(leg.driver_id);
    let driver: CompanyVoucherDriver | null = null;
    let vehicle: CompanyVoucherVehicle | null = null;

    if (driverId) {
      const block = await fetchDriverBlock(driverId, leg);
      driver = block.driver;
      vehicle = block.vehicle;
    } else {
      vehicle = vehicleFromBookingRow(leg);
    }

    out.push({
      legIndex: leg.leg_index ?? out.length + 1,
      booking: leg,
      driver,
      vehicle,
    });
  }

  return out;
}

/** Loads booking + driver/vehicle/host details for the company voucher UI and PDF. */
export async function fetchCompanyVoucherData(
  bookingId: string,
  companyUserId?: string,
  viewerUserId?: string,
): Promise<{ data: CompanyVoucherData | null; error: Error | null }> {
  const { data: raw, error } = await fetchBookingById(bookingId, companyUserId);
  if (error) return { data: null, error };
  if (!raw) return { data: null, error: new Error('booking not found') };

  const [booking] = await enrichBookingsForList([raw]);
  const companyId = trimUserId(booking.company_id);
  const viewerId = trimUserId(viewerUserId ?? companyUserId);
  const isCompanyViewer = !!viewerId && viewerId === companyId;
  let company: CompanyVoucherCompany | null = null;
  if (companyId) {
    company = await fetchCompanyBlock(companyId, booking);
  }

  const parentMasterId = booking.parent_booking_id?.trim() || null;
  if (parentMasterId && viewerId && !isCompanyViewer) {
    const { data: convoyPeerLegs } = await fetchConvoyPeerLegs(parentMasterId, viewerId);
    const driverId = trimUserId(booking.driver_id);
    let driver: CompanyVoucherDriver | null = null;
    let vehicle: CompanyVoucherVehicle | null = null;
    let host: CompanyVoucherHost | null = null;

    if (driverId) {
      const block = await fetchDriverBlock(driverId, booking);
      driver = block.driver;
      vehicle = block.vehicle;
    }

    return {
      data: {
        booking,
        driver,
        vehicle,
        host,
        company,
        convoyPeerLegs: convoyPeerLegs.length > 0 ? convoyPeerLegs : undefined,
        convoyMasterId: parentMasterId,
      },
      error: null,
    };
  }

  if (booking.is_group_master) {
    const convoyLegs = await buildConvoyLegs(booking.id, companyUserId);
    return {
      data: {
        booking,
        driver: null,
        vehicle: null,
        host: null,
        company,
        convoyLegs,
      },
      error: null,
    };
  }

  const driverId = trimUserId(booking.driver_id);
  let hostId = trimUserId(booking.host_driver_id);

  let driver: CompanyVoucherDriver | null = null;
  let vehicle: CompanyVoucherVehicle | null = null;
  let host: CompanyVoucherHost | null = null;

  if (driverId) {
    const block = await fetchDriverBlock(driverId, booking);
    driver = block.driver;
    vehicle = block.vehicle;

    if (!hostId && driverId) {
      const { data: fleet } = await supabase
        .from('driver_fleet')
        .select('host_driver_id')
        .eq('sub_driver_id', driverId)
        .eq('status', 'accepted')
        .maybeSingle();
      hostId = trimUserId((fleet as { host_driver_id?: string } | null)?.host_driver_id);
    }
  }

  if (hostId && hostId !== driverId) {
    host = await fetchHostBlock(hostId, booking);
  }

  return {
    data: { booking, driver, vehicle, host, company },
    error: null,
  };
}

export function convoyVoucherCode(booking: BookingRow): string {
  return (
    booking.group_code?.trim() ||
    booking.voucher_code?.trim() ||
    `KEKE-${booking.id.slice(0, 6).toUpperCase()}`
  );
}

/** Build voucher data when the booking row is already loaded (e.g. dashboard list). */
export async function enrichCompanyVoucherFromBooking(
  booking: BookingRow,
  viewerUserId?: string,
): Promise<{ data: CompanyVoucherData; error: Error | null }> {
  const res = await fetchCompanyVoucherData(booking.id, undefined, viewerUserId);
  if (res.data) return { data: res.data, error: null };
  return {
    data: { booking, driver: null, vehicle: null, host: null, company: null },
    error: res.error,
  };
}

export function vehicleMakeModelYearLine(vehicle: CompanyVoucherVehicle | null): string {
  if (!vehicle) return '—';
  const parts = [vehicle.makeName, vehicle.modelName, vehicle.year ? String(vehicle.year) : null].filter(
    Boolean,
  ) as string[];
  return parts.length ? parts.join(' ') : '—';
}
