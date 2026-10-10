import { isGeorgiaRegionCode, type GeorgiaRegionCode } from './georgiaRegions';
import { supabase } from './supabase';

/**
 * The dispatch log, read back for the admin panel.
 *
 * Rows are written by `log_dispatch()` at the moment the waves are decided, so
 * this is the record of what actually happened — not a replay of the ranking
 * against data that has since moved.
 */

export type DispatchLogRow = {
  id: string;
  created_at: string;
  booking_id: string | null;
  company_id: string | null;
  regions: GeorgiaRegionCode[];
  from_location: string | null;
  to_location: string | null;
  wave1_driver_ids: string[];
  wave2_driver_ids: string[];
  wave1_token_count: number;
  wave2_token_count: number;
  wave1_sent: number;
  wave1_failed: number;
  /** Filled in from the booking row, when it still exists. */
  bookingStatus: string | null;
  bookingDriverId: string | null;
  companyName: string | null;
  /** Names for the ids above, in the same order. */
  wave1Names: string[];
  wave2Names: string[];
  /** Name of the driver who ended up with the job, when one did. */
  winnerName: string | null;
  /** True when the booking went to someone who was only in the second wave. */
  wonFromWave2: boolean;
};

const LOG_SELECT =
  'id, created_at, booking_id, company_id, regions, from_location, to_location, wave1_driver_ids, wave2_driver_ids, wave1_token_count, wave2_token_count, wave1_sent, wave1_failed';

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export async function fetchDispatchLog(limit = 60): Promise<{
  data: DispatchLogRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('dispatch_log')
    .select(LOG_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: new Error(error.message) };

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { data: [], error: null };

  const bookingIds = [
    ...new Set(rows.map((r) => String(r.booking_id ?? '').trim()).filter(Boolean)),
  ];
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [
        ...ids(r.wave1_driver_ids),
        ...ids(r.wave2_driver_ids),
        String(r.company_id ?? '').trim(),
      ]),
    ),
  ].filter(Boolean);

  const [bookingsRes, usersRes] = await Promise.all([
    bookingIds.length
      ? supabase.from('bookings').select('id, status, driver_id').in('id', bookingIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from('users').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const bookingById = new Map<string, { status: string | null; driver_id: string | null }>();
  for (const b of (bookingsRes.data ?? []) as Record<string, unknown>[]) {
    bookingById.set(String(b.id), {
      status: (b.status as string | null) ?? null,
      driver_id: String(b.driver_id ?? '').trim() || null,
    });
  }

  const nameById = new Map<string, string>();
  for (const u of (usersRes.data ?? []) as Record<string, unknown>[]) {
    const name = String(u.full_name ?? '').trim();
    if (name) nameById.set(String(u.id), name);
  }

  const nameOf = (id: string) => nameById.get(id) ?? id.slice(0, 8);

  const out: DispatchLogRow[] = rows.map((r) => {
    const wave1 = ids(r.wave1_driver_ids);
    const wave2 = ids(r.wave2_driver_ids);
    const bookingId = String(r.booking_id ?? '').trim() || null;
    const booking = bookingId ? bookingById.get(bookingId) : undefined;
    const winnerId = booking?.driver_id ?? null;

    return {
      id: String(r.id),
      created_at: String(r.created_at ?? ''),
      booking_id: bookingId,
      company_id: String(r.company_id ?? '').trim() || null,
      regions: ids(r.regions).filter(isGeorgiaRegionCode),
      from_location: (r.from_location as string | null) ?? null,
      to_location: (r.to_location as string | null) ?? null,
      wave1_driver_ids: wave1,
      wave2_driver_ids: wave2,
      wave1_token_count: Number(r.wave1_token_count ?? 0),
      wave2_token_count: Number(r.wave2_token_count ?? 0),
      wave1_sent: Number(r.wave1_sent ?? 0),
      wave1_failed: Number(r.wave1_failed ?? 0),
      bookingStatus: booking?.status ?? null,
      bookingDriverId: winnerId,
      companyName: r.company_id ? (nameById.get(String(r.company_id)) ?? null) : null,
      wave1Names: wave1.map(nameOf),
      wave2Names: wave2.map(nameOf),
      winnerName: winnerId ? nameOf(winnerId) : null,
      // Worth seeing on its own: the first wave had its chance and passed.
      wonFromWave2: winnerId != null && !wave1.includes(winnerId) && wave2.includes(winnerId),
    };
  });

  return { data: out, error: null };
}
