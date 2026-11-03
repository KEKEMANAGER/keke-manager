import { supabase } from './supabase';

/**
 * A host's calendar for one of his cars (supabase/migrations/
 * 20261103130000_vehicle_calendar.sql): whole days on which the car is not
 * available. On those days it is offered no job and no job can be taken with
 * it. The server works in Tbilisi days; the app sends calendar dates.
 */
export type VehicleDayStatus = 'blocked' | 'booked';

/** Why the server refused a change (see set_vehicle_day_blocked). */
export type VehicleDayRefusal =
  | 'not_signed_in'
  | 'not_your_vehicle'
  | 'not_a_host'
  | 'past_day'
  | 'too_far'
  | 'vehicle_has_booking';

const REFUSALS: readonly VehicleDayRefusal[] = [
  'not_signed_in',
  'not_your_vehicle',
  'not_a_host',
  'past_day',
  'too_far',
  'vehicle_has_booking',
];

/** `YYYY-MM-DD` of the day as it is on the phone's calendar. */
export function calendarDayKey(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function fetchVehicleCalendar(
  vehicleId: string,
  from: Date,
  to: Date,
): Promise<{ days: Record<string, VehicleDayStatus>; error: Error | null }> {
  const id = vehicleId.trim();
  if (!id) return { days: {}, error: null };
  const { data, error } = await supabase.rpc('vehicle_calendar', {
    p_vehicle_id: id,
    p_from: calendarDayKey(from),
    p_to: calendarDayKey(to),
  });
  if (error) return { days: {}, error: new Error(error.message) };
  const days: Record<string, VehicleDayStatus> = {};
  for (const row of (data ?? []) as { day?: string; status?: string }[]) {
    const key = typeof row.day === 'string' ? row.day.slice(0, 10) : '';
    if (!key) continue;
    days[key] = row.status === 'booked' ? 'booked' : 'blocked';
  }
  return { days, error: null };
}

export async function setVehicleDayBlocked(
  vehicleId: string,
  day: Date,
  blocked: boolean,
): Promise<{ ok: boolean; refusal: VehicleDayRefusal | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('set_vehicle_day_blocked', {
    p_vehicle_id: vehicleId.trim(),
    p_day: calendarDayKey(day),
    p_blocked: blocked,
  });
  if (error) return { ok: false, refusal: null, error: new Error(error.message) };
  const res = (data ?? {}) as { ok?: boolean; code?: string };
  if (res.ok === true) return { ok: true, refusal: null, error: null };
  const code = REFUSALS.find((c) => c === res.code) ?? null;
  return { ok: false, refusal: code, error: code ? null : new Error(res.code || 'refused') };
}
