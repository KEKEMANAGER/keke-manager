import { supabase } from './supabase';

/**
 * Inserts a rating row. DB columns `booking_id`, `company_id`, `driver_id` are **text**
 * (booking uuid as string + Clerk user ids), not Postgres uuid.
 */
export async function insertRating(
  /** `bookings.id` (uuid as string). */
  bookingId: string,
  /** Clerk company user id (text). */
  companyId: string,
  /** Clerk driver user id (text). */
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

export async function fetchDriverAverageRating(driverClerkId: string): Promise<{
  average: number;
  count: number;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('ratings')
    .select('overall')
    .eq('driver_id', driverClerkId);
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
