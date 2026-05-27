import { supabase } from './supabase';

export function isDuplicateBookingRatingError(error: unknown): boolean {
  const msg =
    (typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String((error as { message?: string }).message)) ||
    (error instanceof Error ? error.message : String(error ?? ''));
  const lower = msg.toLowerCase();
  return (
    lower.includes('ratings_company_booking_unique') ||
    (lower.includes('duplicate key') && lower.includes('booking_id'))
  );
}

export type BookingRatingRow = {
  booking_id: string;
  overall: number;
  comment: string | null;
  created_at: string | null;
};

/**
 * Inserts a rating row. DB columns `booking_id`, `company_id`, `driver_id` are text
 * (booking uuid as string + Supabase user ids), not Postgres uuid.
 */
export async function insertRating(
  /** `bookings.id` (uuid as string). */
  bookingId: string,
  /** Company Supabase user id. */
  companyId: string,
  /** Driver Supabase user id. */
  driverId: string,
  overall: number,
  comment: string | null,
) {
  const { error } = await supabase.from('ratings').insert({
    booking_id: bookingId,
    company_id: companyId,
    driver_id: driverId,
    overall,
    comment: comment?.trim() || null,
  });
  return { error };
}

/** One rating per company per booking (tour, transfer, or day_tour each = one booking row). */
export async function fetchRatingForBooking(
  bookingId: string,
  companyId?: string,
): Promise<{ data: BookingRatingRow | null; error: Error | null }> {
  const bid = bookingId.trim();
  if (!bid) {
    return { data: null, error: new Error('booking id არ არის') };
  }

  const selectCols = 'booking_id, overall, comment, created_at';

  const { data: byBooking, error: byBookingErr } = await supabase
    .from('ratings')
    .select(selectCols)
    .eq('booking_id', bid)
    .order('created_at', { ascending: false })
    .limit(1);
  if (byBookingErr) {
    return { data: null, error: new Error(byBookingErr.message) };
  }
  const fromBooking = (byBooking?.[0] as BookingRatingRow | undefined) ?? null;
  if (fromBooking) {
    return { data: fromBooking, error: null };
  }

  const cid = companyId?.trim();
  if (!cid) {
    return { data: null, error: null };
  }

  const { data: byCompany, error: byCompanyErr } = await supabase
    .from('ratings')
    .select(selectCols)
    .eq('booking_id', bid)
    .eq('company_id', cid)
    .order('created_at', { ascending: false })
    .limit(1);
  if (byCompanyErr) {
    return { data: null, error: new Error(byCompanyErr.message) };
  }
  const row = (byCompany?.[0] as BookingRatingRow | undefined) ?? null;
  return { data: row, error: null };
}

/** Booking ids this company has already rated (for list badges). */
export async function fetchRatedBookingIdsForCompany(
  companyId: string,
): Promise<{ ids: Set<string>; error: Error | null }> {
  const cid = companyId.trim();
  if (!cid) {
    return { ids: new Set(), error: new Error('company id არ არის') };
  }
  const ids = new Set<string>();

  const { data: direct, error: directErr } = await supabase
    .from('ratings')
    .select('booking_id')
    .eq('company_id', cid);
  if (directErr) {
    return { ids: new Set(), error: new Error(directErr.message) };
  }
  for (const r of direct ?? []) {
    const id = (r as { booking_id?: string }).booking_id?.trim();
    if (id) ids.add(id);
  }

  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('company_id', cid);
  if (bookingsErr) {
    return { ids, error: new Error(bookingsErr.message) };
  }
  const bookingIds = (bookings ?? [])
    .map((b) => (b as { id?: string }).id?.trim())
    .filter((id): id is string => !!id);
  if (bookingIds.length > 0) {
    const { data: linked, error: linkedErr } = await supabase
      .from('ratings')
      .select('booking_id')
      .in('booking_id', bookingIds);
    if (linkedErr) {
      return { ids, error: new Error(linkedErr.message) };
    }
    for (const r of linked ?? []) {
      const id = (r as { booking_id?: string }).booking_id?.trim();
      if (id) ids.add(id);
    }
  }

  return { ids, error: null };
}

export async function fetchDriverAverageRating(driverUserId: string): Promise<{
  average: number;
  count: number;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('ratings')
    .select('overall')
    .eq('driver_id', driverUserId);
  if (error || !data?.length) {
    return { average: 0, count: 0, error: error ? new Error(error.message) : null };
  }
  const rows = data as { overall: number }[];
  const sum = rows.reduce((s, r) => s + Number(r.overall), 0);
  return {
    average: Math.round((sum / rows.length) * 10) / 10,
    count: rows.length,
    error: null,
  };
}
