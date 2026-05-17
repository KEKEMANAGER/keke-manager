import type { DriverLocationRow } from './locations';
import { supabase } from './supabase';
import type { VehicleRow } from './vehicles';

export type DriverFleetRow = {
  id: string;
  host_driver_id: string;
  sub_driver_id: string;
  vehicle_id: string;
  created_at: string;
};

export type FleetMemberView = DriverFleetRow & {
  sub_full_name: string | null;
  sub_email: string | null;
  vehicle: Pick<
    VehicleRow,
    'id' | 'model' | 'plate' | 'type' | 'class' | 'is_active' | 'photo_front'
  > | null;
  location: DriverLocationRow | null;
};

export type FleetSubContext = {
  kind: 'sub';
  fleetId: string;
  hostDriverId: string;
  hostName: string | null;
  vehicleId: string;
  vehicle: VehicleRow | null;
};

export type FleetHostContext = {
  kind: 'host';
  memberCount: number;
};

export type FleetContext =
  | FleetSubContext
  | FleetHostContext
  | { kind: 'none' };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve driver user id from email or uuid string. */
export async function resolveDriverUserId(
  emailOrId: string,
): Promise<{ userId: string | null; error: Error | null }> {
  const raw = emailOrId.trim();
  if (!raw) return { userId: null, error: null };

  let query = supabase.from('users').select('id, role, email').eq('role', 'driver');

  if (UUID_RE.test(raw)) {
    query = query.eq('id', raw);
  } else {
    query = query.ilike('email', raw);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return { userId: null, error: new Error(error.message) };
  if (!data) return { userId: null, error: new Error('მძღოლი ვერ მოიძებნა') };
  return { userId: (data as { id: string }).id, error: null };
}

/** Sub / hired driver: host-assigned vehicle from `driver_fleet`. */
export async function fetchFleetContext(driverId: string): Promise<FleetContext> {
  const id = driverId.trim();
  if (!id) return { kind: 'none' };

  const { data: subRow, error: fleetErr } = await supabase
    .from('driver_fleet')
    .select('id, host_driver_id, vehicle_id')
    .eq('sub_driver_id', id)
    .maybeSingle();

  if (fleetErr && __DEV__) {
    console.warn('[fetchFleetContext] driver_fleet', fleetErr.message);
  }

  if (subRow) {
    const row = subRow as { id: string; host_driver_id: string; vehicle_id: string };
    const [{ data: host }, { data: vehicle, error: vehicleErr }] = await Promise.all([
      supabase.from('users').select('full_name').eq('id', row.host_driver_id).maybeSingle(),
      supabase
        .from('vehicles')
        .select(
          'id,driver_id,is_active,photo_front,photo_left,photo_right,photo_interior,photo_rear,type,class,model,color,year,plate,is_verified,updated_at',
        )
        .eq('id', row.vehicle_id)
        .maybeSingle(),
    ]);
    if (vehicleErr && __DEV__) {
      console.warn('[fetchFleetContext] vehicle', vehicleErr.message);
    }
    return {
      kind: 'sub',
      fleetId: row.id,
      hostDriverId: row.host_driver_id,
      hostName: (host as { full_name?: string | null } | null)?.full_name ?? null,
      vehicleId: row.vehicle_id,
      vehicle: (vehicle as VehicleRow | null) ?? null,
    };
  }

  const { count } = await supabase
    .from('driver_fleet')
    .select('id', { count: 'exact', head: true })
    .eq('host_driver_id', id);

  if ((count ?? 0) > 0) {
    return { kind: 'host', memberCount: count ?? 0 };
  }

  return { kind: 'none' };
}

export async function fetchFleetForHost(hostDriverId: string): Promise<{
  data: FleetMemberView[];
  error: Error | null;
}> {
  const { data: rows, error } = await supabase
    .from('driver_fleet')
    .select('id, host_driver_id, sub_driver_id, vehicle_id, created_at')
    .eq('host_driver_id', hostDriverId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };
  const fleet = (rows ?? []) as DriverFleetRow[];
  if (fleet.length === 0) return { data: [], error: null };

  const subIds = fleet.map((f) => f.sub_driver_id);
  const vehicleIds = fleet.map((f) => f.vehicle_id);

  const [{ data: users }, { data: vehicles }, { data: locs }] = await Promise.all([
    supabase.from('users').select('id, full_name, email').in('id', subIds),
    supabase
      .from('vehicles')
      .select('id, model, plate, type, class, is_active, photo_front')
      .in('id', vehicleIds),
    supabase
      .from('driver_locations')
      .select('driver_id, latitude, longitude, updated_at')
      .in('driver_id', subIds),
  ]);

  type U = { id: string; full_name: string | null; email: string | null };
  type V = FleetMemberView['vehicle'];
  const userMap = new Map((users as U[] ?? []).map((u) => [u.id, u]));
  const vehicleMap = new Map((vehicles as V[] ?? []).map((v) => [v!.id, v]));
  const locMap = new Map(
    (locs as DriverLocationRow[] ?? []).map((l) => [l.driver_id, l]),
  );

  return {
    data: fleet.map((f) => {
      const u = userMap.get(f.sub_driver_id);
      return {
        ...f,
        sub_full_name: u?.full_name ?? null,
        sub_email: u?.email ?? null,
        vehicle: vehicleMap.get(f.vehicle_id) ?? null,
        location: locMap.get(f.sub_driver_id) ?? null,
      };
    }),
    error: null,
  };
}

/** Host + all sub-driver ids in fleet (for company map). */
export async function fetchFleetDriverIdsAround(driverId: string): Promise<string[]> {
  const id = driverId.trim();
  if (!id) return [];

  const { data: asHost } = await supabase
    .from('driver_fleet')
    .select('sub_driver_id')
    .eq('host_driver_id', id);

  if (asHost?.length) {
    const subs = (asHost as { sub_driver_id: string }[]).map((r) => r.sub_driver_id);
    return [id, ...subs];
  }

  const { data: subRow } = await supabase
    .from('driver_fleet')
    .select('host_driver_id')
    .eq('sub_driver_id', id)
    .maybeSingle();

  if (subRow) {
    const hostId = (subRow as { host_driver_id: string }).host_driver_id;
    const { data: siblings } = await supabase
      .from('driver_fleet')
      .select('sub_driver_id')
      .eq('host_driver_id', hostId);
    const subs = (siblings as { sub_driver_id: string }[] | null)?.map((r) => r.sub_driver_id) ?? [];
    return [hostId, ...subs];
  }

  return [id];
}

export async function assignSubDriverToVehicle(
  hostDriverId: string,
  vehicleId: string,
  subDriverId: string,
): Promise<{ data: DriverFleetRow | null; error: Error | null }> {
  if (hostDriverId === subDriverId) {
    return { data: null, error: new Error('თავს ვერ მიუთითებთ sub მძღოლად') };
  }

  const { data: vehicle, error: vErr } = await supabase
    .from('vehicles')
    .select('id, driver_id')
    .eq('id', vehicleId)
    .eq('driver_id', hostDriverId)
    .maybeSingle();

  if (vErr) return { data: null, error: new Error(vErr.message) };
  if (!vehicle) {
    return { data: null, error: new Error('მანქანა ვერ მოიძებნა ან თქვენზე არ არის') };
  }

  const { data, error } = await supabase
    .from('driver_fleet')
    .upsert(
      {
        host_driver_id: hostDriverId,
        sub_driver_id: subDriverId,
        vehicle_id: vehicleId,
      },
      { onConflict: 'vehicle_id' },
    )
    .select('id, host_driver_id, sub_driver_id, vehicle_id, created_at')
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };

  await supabase
    .from('users')
    .update({ available_for_hire: false })
    .eq('id', subDriverId);

  return { data: data as DriverFleetRow | null, error: null };
}

export async function removeFleetMember(
  fleetId: string,
  hostDriverId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('driver_fleet')
    .delete()
    .eq('id', fleetId)
    .eq('host_driver_id', hostDriverId);
  return { error: error ? new Error(error.message) : null };
}
