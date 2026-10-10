import {
  GEORGIA_REGION_CODES,
  isGeorgiaRegionCode,
  resolveBookingRegions,
  type GeorgiaRegionCode,
} from './georgiaRegions';
import { supabase } from './supabase';

/**
 * Where the drivers are, region by region.
 *
 * Dispatch never excludes anyone by region — a driver who narrowed his
 * coverage only drops to the second wave. That is deliberate, and it means a
 * region with no drivers at all is invisible at dispatch time: the bookings
 * still go out, they just go to people who said they do not drive there. This
 * panel is the one place that can say "nobody has claimed Svaneti" before a
 * company finds out the slow way.
 */

export type RegionCoverageRow = {
  code: GeorgiaRegionCode;
  /** Drivers who named this region. */
  declared: number;
  /** Of those, the ones marked available right now. */
  available: number;
  /** Open (pending) bookings whose pickup, drop-off or route lands here. */
  openBookings: number;
  /** Drivers who named this region among the regions they tour countrywide. */
  tourReady: number;
};

export type RegionCoverageSummary = {
  rows: RegionCoverageRow[];
  /** Drivers who declared nothing, so every booking reaches them first wave. */
  everywhere: number;
  /** Of those, available right now. */
  everywhereAvailable: number;
  /** Drivers who travel the whole country for multi-day tours. */
  countrywideTour: number;
  totalDrivers: number;
  /** Pending bookings whose text named no region we recognise. */
  unresolvedBookings: number;
  /**
   * Set when the open-booking counts could not be read. Without it a failed
   * bookings query would silently read as "no open work anywhere", and the
   * uncovered-region warning — the whole point of this screen — would never
   * fire.
   */
  bookingsError: string | null;
  /** True when there are more pending bookings than the query returned. */
  bookingsTruncated: boolean;
};

export type AdminRegionDriver = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_available: boolean | null;
  current_city: string | null;
  service_regions: string[] | null;
  travels_countrywide: boolean | null;
};

const DRIVER_SELECT =
  'id, full_name, phone, is_available, current_city, service_regions, travels_countrywide';

/** Enough to see the shape of the open work without reading the whole table. */
const BOOKING_SCAN_LIMIT = 500;

function emptyRows(): Map<GeorgiaRegionCode, RegionCoverageRow> {
  const map = new Map<GeorgiaRegionCode, RegionCoverageRow>();
  for (const code of GEORGIA_REGION_CODES) {
    map.set(code, { code, declared: 0, available: 0, openBookings: 0, tourReady: 0 });
  }
  return map;
}

/**
 * The drivers a booking can actually reach.
 *
 * Deliberately the same test dispatch uses (`lib/notifications.ts`): verified
 * and not blocked. Not `verification_status = 'approved'` — dispatch never
 * reads that column, so filtering on it here would count a blocked driver
 * towards a region's coverage and keep the gap warning quiet for a region no
 * booking can ever reach.
 */
export async function fetchAdminRegionDrivers(): Promise<{
  data: AdminRegionDriver[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('users')
    .select(DRIVER_SELECT)
    .eq('role', 'driver')
    .eq('is_verified', true)
    .or('is_blocked.is.null,is_blocked.is.false')
    .order('full_name', { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as AdminRegionDriver[], error: null };
}

export async function fetchRegionCoverage(): Promise<{
  data: RegionCoverageSummary | null;
  drivers: AdminRegionDriver[];
  error: Error | null;
}> {
  const [driversRes, bookingsRes] = await Promise.all([
    fetchAdminRegionDrivers(),
    supabase
      .from('bookings')
      .select('id, from_location, to_location, route')
      .eq('status', 'pending')
      .limit(BOOKING_SCAN_LIMIT),
  ]);

  if (driversRes.error) return { data: null, drivers: [], error: driversRes.error };

  const drivers = driversRes.data;
  const rows = emptyRows();

  let everywhere = 0;
  let everywhereAvailable = 0;
  let countrywideTour = 0;

  for (const d of drivers) {
    const declared = (d.service_regions ?? []).filter(isGeorgiaRegionCode);
    if (d.travels_countrywide === true) countrywideTour += 1;

    if (declared.length === 0) {
      everywhere += 1;
      if (d.is_available === true) everywhereAvailable += 1;
      continue;
    }
    for (const code of declared) {
      const row = rows.get(code);
      if (!row) continue;
      row.declared += 1;
      if (d.is_available === true) row.available += 1;
      if (d.travels_countrywide === true) row.tourReady += 1;
    }
  }

  let unresolvedBookings = 0;
  const bookingRows = (bookingsRes.data ?? []) as {
    from_location: string | null;
    to_location: string | null;
    route: string | null;
  }[];
  for (const b of bookingRows) {
    const regions = resolveBookingRegions(b);
    if (regions.length === 0) {
      unresolvedBookings += 1;
      continue;
    }
    for (const code of regions) {
      const row = rows.get(code);
      if (row) row.openBookings += 1;
    }
  }

  return {
    data: {
      // Worst coverage first: a region with open work and nobody claiming it
      // is the row he needs to see, not the one alphabetical order gives him.
      rows: [...rows.values()].sort((a, b) => {
        const aGap = a.declared === 0 ? 1 : 0;
        const bGap = b.declared === 0 ? 1 : 0;
        if (aGap !== bGap) return bGap - aGap;
        if (a.openBookings !== b.openBookings) return b.openBookings - a.openBookings;
        return a.declared - b.declared;
      }),
      everywhere,
      everywhereAvailable,
      countrywideTour,
      totalDrivers: drivers.length,
      unresolvedBookings,
      bookingsError: bookingsRes.error ? bookingsRes.error.message : null,
      bookingsTruncated: bookingRows.length >= BOOKING_SCAN_LIMIT,
    },
    drivers,
    error: null,
  };
}

/** The drivers behind one region's number, for the drill-down. */
export function driversForRegion(
  drivers: AdminRegionDriver[],
  code: GeorgiaRegionCode,
): AdminRegionDriver[] {
  return drivers.filter((d) =>
    (d.service_regions ?? []).filter(isGeorgiaRegionCode).includes(code),
  );
}

/** Drivers who named no region, so they take work anywhere. */
export function driversEverywhere(drivers: AdminRegionDriver[]): AdminRegionDriver[] {
  return drivers.filter((d) => (d.service_regions ?? []).filter(isGeorgiaRegionCode).length === 0);
}
