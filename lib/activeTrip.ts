import { supabase } from './supabase';

/**
 * The trip this driver is running right now, if any: his most recently touched
 * in-progress booking. Used where the GPS has to know the trip without being
 * handed it — the GPS tab opened from the tab bar, or the app reopened mid-trip.
 */
export async function fetchActiveTripId(driverId: string): Promise<string | null> {
  const id = driverId?.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('driver_id', id)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const tripId = String((data as { id: string }).id ?? '').trim();
  return tripId || null;
}

/**
 * The same question, telling "no trip" apart from "could not ask" (no
 * internet): only a sure "no trip" may stop a running trip's GPS.
 */
export async function fetchActiveTripState(
  driverId: string,
): Promise<{ known: boolean; tripId: string | null }> {
  const id = driverId?.trim();
  if (!id) return { known: false, tripId: null };
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('driver_id', id)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { known: false, tripId: null };
    const tripId = data ? String((data as { id: string }).id ?? '').trim() : '';
    return { known: true, tripId: tripId || null };
  } catch {
    return { known: false, tripId: null };
  }
}

export type TripRunState = 'running' | 'waiting' | 'ended' | 'unknown';

/** A trip in one of these is over: its GPS has nothing more to do. */
const TRIP_OVER = new Set(['completed', 'cancelled', 'rejected']);

/**
 * Where this trip stands, for the GPS that runs for it:
 *   'running' - in progress;
 *   'waiting' - not started yet (accepted, pending): GPS turned on early stays on;
 *   'ended'   - finished, cancelled or declined: the GPS should stop;
 *   'unknown' - no answer (no internet, an error), or no row. No row can mean
 *               the trip is no longer his to see, but also a request that went
 *               out without a valid sign-in (a token refresh that failed in
 *               the background), so it never stops a trip on its own; the
 *               server drops what such a phone sends after the trip anyway.
 */
export async function fetchTripRunState(bookingId: string): Promise<TripRunState> {
  const id = bookingId?.trim();
  if (!id) return 'unknown';
  try {
    const { data, error } = await supabase.from('bookings').select('status').eq('id', id).maybeSingle();
    if (error || !data) return 'unknown';
    const status = String((data as { status?: string }).status ?? '').trim().toLowerCase();
    if (status === 'in_progress') return 'running';
    if (TRIP_OVER.has(status)) return 'ended';
    return status ? 'waiting' : 'unknown';
  } catch {
    return 'unknown';
  }
}
