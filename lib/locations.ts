import { supabase } from './supabase';

export type DriverLocationRow = {
  driver_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
};

export async function upsertDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await supabase.from('driver_locations').upsert(
    { driver_id: driverId, latitude, longitude, updated_at: new Date().toISOString() },
    { onConflict: 'driver_id' },
  );
}

export async function clearDriverLocation(driverId: string): Promise<void> {
  await supabase.from('driver_locations').delete().eq('driver_id', driverId);
}

export async function fetchDriverLocation(
  driverId: string,
): Promise<DriverLocationRow | null> {
  const { data } = await supabase
    .from('driver_locations')
    .select('driver_id, latitude, longitude, updated_at')
    .eq('driver_id', driverId)
    .maybeSingle();
  return data as DriverLocationRow | null;
}

export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (row: DriverLocationRow) => void,
) {
  return supabase
    .channel(`driver-loc-${driverId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
      (payload) => {
        const row = payload.new as Partial<DriverLocationRow>;
        if (row?.latitude != null && row?.longitude != null) {
          onUpdate(row as DriverLocationRow);
        }
      },
    )
    .subscribe();
}
