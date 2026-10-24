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
