import type { DriverLocationRow } from './locations';
import { notifyFleetInviteToSub } from './fleetNotifications';
import { sanitizeLanguageCodes } from './spokenLanguages';
import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import { normalizeVehicleClass, normalizeVehicleType } from './vehicleCatalog';
import type { VehicleRow } from './vehicles';

const FLEET_GPS_LIVE_MS = 90_000;

export type FleetInviteStatus = 'pending' | 'accepted' | 'rejected';

export type DriverFleetRow = {
  id: string;
  host_driver_id: string;
  sub_driver_id: string;
  vehicle_id: string;
  status: FleetInviteStatus;
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

export type FleetMemberProfile = {
  sub_driver_id: string;
  fleet_id: string;
  fleet_status: FleetInviteStatus;
  fleet_created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  languages: string[];
  experience_years: number | null;
  is_verified: boolean;
  vehicle_id: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  vehicle_color: string | null;
  vehicle_year: number | null;
  vehicle_photo_front: string | null;
  rating_average: number;
  rating_count: number;
  active_booking_id: string | null;
  active_booking_route: string | null;
  active_booking_status: string | null;
};

export type FleetInviteView = DriverFleetRow & {
  host_full_name: string | null;
  vehicle: Pick<VehicleRow, 'id' | 'model' | 'plate' | 'type' | 'class'> | null;
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
  pendingCount: number;
};

export type FleetContext =
  | FleetSubContext
  | FleetHostContext
  | { kind: 'none' };

function fleetStatus(row: { status?: string | null }): FleetInviteStatus {
  const s = row.status?.trim().toLowerCase();
  if (s === 'pending' || s === 'rejected') return s;
  return 'accepted';
}

function isMissingFleetStatusColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('status') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('column') ||
      m.includes('does not exist'))
  );
}

/** Fleet sub: host-assigned vehicle matches booking type/class. */
export async function fleetAssignedVehicleMatchesBooking(
  subDriverId: string,
  bookingVehicleType: string,
  bookingVehicleClass: string | null | undefined,
): Promise<boolean> {
  const bookingType = normalizeVehicleType(bookingVehicleType);
  const bookingClass = normalizeVehicleClass(bookingVehicleClass ?? '');
  if (!bookingType || !bookingClass) return false;

  const ctx = await fetchFleetContext(subDriverId.trim());
  if (ctx.kind !== 'sub' || !ctx.vehicle) return false;

  const vType = normalizeVehicleType(ctx.vehicle.type ?? '');
  const vClass = normalizeVehicleClass(ctx.vehicle.class ?? '');
  return vType === bookingType && (!vClass || !bookingClass || vClass === bookingClass);
}

/** Sub with live GPS on host fleet (for quick booking assignment). */
export function pickLiveFleetMember(members: FleetMemberView[]): FleetMemberView | null {
  const now = Date.now();
  const live = members.filter((m) => {
    if (!m.location) return false;
    return now - new Date(m.location.updated_at).getTime() <= FLEET_GPS_LIVE_MS;
  });
  if (live.length !== 1) return null;
  return live[0] ?? null;
}

/** Resolve driver user id from email or uuid string. */
export async function resolveDriverUserId(
  emailOrId: string,
): Promise<{ userId: string | null; error: Error | null }> {
  const raw = emailOrId.trim();
  if (!raw) return { userId: null, error: null };

  const { data, error } = await supabase.rpc('resolve_driver_for_fleet_invite', {
    p_lookup: raw,
  });
  if (error) return { userId: null, error: new Error(error.message) };
  const userId = data ? String(data) : null;
  if (!userId) return { userId: null, error: new Error('მძღოლი ვერ მოიძებნა') };
  return { userId, error: null };
}

/** Sub / hired driver: host-assigned vehicle from accepted `driver_fleet`. */
export async function fetchFleetContext(driverId: string): Promise<FleetContext> {
  const id = driverId.trim();
  if (!id) return { kind: 'none' };

  const { data: subRow, error: fleetErr } = await supabase
    .from('driver_fleet')
    .select('id, host_driver_id, vehicle_id, status')
    .eq('sub_driver_id', id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (fleetErr && __DEV__) {
    console.warn('[fetchFleetContext] driver_fleet', fleetErr.message);
  }

  if (subRow) {
    const row = subRow as { id: string; host_driver_id: string; vehicle_id: string };
    const [{ data: host }, { data: vehicle, error: vehicleErr }] = await Promise.all([
      supabase.from(USERS_DIRECTORY).select('full_name').eq('id', row.host_driver_id).maybeSingle(),
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

  const [{ count: acceptedCount }, { count: pendingCount }] = await Promise.all([
    supabase
      .from('driver_fleet')
      .select('id', { count: 'exact', head: true })
      .eq('host_driver_id', id)
      .eq('status', 'accepted'),
    supabase
      .from('driver_fleet')
      .select('id', { count: 'exact', head: true })
      .eq('host_driver_id', id)
      .eq('status', 'pending'),
  ]);

  const members = (acceptedCount ?? 0) + (pendingCount ?? 0);
  if (members > 0) {
    return {
      kind: 'host',
      memberCount: acceptedCount ?? 0,
      pendingCount: pendingCount ?? 0,
    };
  }

  return { kind: 'none' };
}

export async function fetchFleetForHost(
  hostDriverId: string,
  opts?: { includePending?: boolean },
): Promise<{
  data: FleetMemberView[];
  error: Error | null;
}> {
  let query = supabase
    .from('driver_fleet')
    .select('id, host_driver_id, sub_driver_id, vehicle_id, status, created_at')
    .eq('host_driver_id', hostDriverId)
    .order('created_at', { ascending: false });

  if (!opts?.includePending) {
    query = query.eq('status', 'accepted');
  } else {
    query = query.in('status', ['pending', 'accepted']);
  }

  const { data: rows, error } = await query;

  if (error) return { data: [], error: new Error(error.message) };
  const fleet = (rows ?? []).map((r) => ({
    ...(r as DriverFleetRow),
    status: fleetStatus(r as { status?: string }),
  }));
  if (fleet.length === 0) return { data: [], error: null };

  const subIds = fleet.map((f) => f.sub_driver_id);
  const vehicleIds = fleet.map((f) => f.vehicle_id);

  const [{ data: fleetMembers }, { data: vehicles }, { data: locs }] = await Promise.all([
    supabase.rpc('get_fleet_members_directory', { p_host_driver_id: hostDriverId }),
    supabase
      .from('vehicles')
      .select('id, model, plate, type, class, is_active, photo_front')
      .in('id', vehicleIds),
    supabase
      .from('driver_locations')
      .select('driver_id, latitude, longitude, updated_at')
      .in('driver_id', subIds),
  ]);

  type FleetMemberDir = { sub_driver_id: string; full_name: string | null; email: string | null };
  type V = FleetMemberView['vehicle'];
  const userMap = new Map(
    ((fleetMembers ?? []) as FleetMemberDir[]).map((u) => [
      u.sub_driver_id,
      { id: u.sub_driver_id, full_name: u.full_name, email: u.email },
    ]),
  );
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
        location: f.status === 'accepted' ? locMap.get(f.sub_driver_id) ?? null : null,
      };
    }),
    error: null,
  };
}

/** Host: full sub-driver profile for fleet detail sheet. */
export async function fetchFleetMemberProfile(
  hostDriverId: string,
  subDriverId: string,
): Promise<{ data: FleetMemberProfile | null; error: Error | null }> {
  const hostId = hostDriverId.trim();
  const subId = subDriverId.trim();
  if (!hostId || !subId) {
    return { data: null, error: new Error('invalid fleet member') };
  }

  const { data, error } = await supabase.rpc('get_fleet_member_profile', {
    p_host_driver_id: hostId,
    p_sub_driver_id: subId,
  });

  if (error) return { data: null, error: new Error(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return { data: null, error: null };

  return {
    data: {
      sub_driver_id: String(row.sub_driver_id ?? subId),
      fleet_id: String(row.fleet_id ?? ''),
      fleet_status: fleetStatus({ status: String(row.fleet_status ?? 'accepted') }),
      fleet_created_at: String(row.fleet_created_at ?? ''),
      full_name: (row.full_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      languages: sanitizeLanguageCodes(Array.isArray(row.languages) ? row.languages : []),
      experience_years:
        typeof row.experience_years === 'number' ? row.experience_years : null,
      is_verified: row.is_verified === true,
      vehicle_id: row.vehicle_id ? String(row.vehicle_id) : null,
      vehicle_model: (row.vehicle_model as string | null) ?? null,
      vehicle_plate: (row.vehicle_plate as string | null) ?? null,
      vehicle_type: (row.vehicle_type as string | null) ?? null,
      vehicle_class: (row.vehicle_class as string | null) ?? null,
      vehicle_color: (row.vehicle_color as string | null) ?? null,
      vehicle_year: typeof row.vehicle_year === 'number' ? row.vehicle_year : null,
      vehicle_photo_front: (row.vehicle_photo_front as string | null) ?? null,
      rating_average: Number(row.rating_average ?? 0) || 0,
      rating_count: Number(row.rating_count ?? 0) || 0,
      active_booking_id: row.active_booking_id ? String(row.active_booking_id) : null,
      active_booking_route: (row.active_booking_route as string | null) ?? null,
      active_booking_status: (row.active_booking_status as string | null) ?? null,
    },
    error: null,
  };
}

/** Accepted fleet members only (for booking assignment). */
export async function fetchAcceptedFleetMembersForHost(hostDriverId: string): Promise<{
  data: FleetMemberView[];
  error: Error | null;
}> {
  return fetchFleetForHost(hostDriverId, { includePending: false });
}

/** Pending fleet invites for sub driver dashboard. */
export async function fetchPendingFleetInvitesForSub(subDriverId: string): Promise<{
  data: FleetInviteView[];
  error: Error | null;
}> {
  const id = subDriverId.trim();
  if (!id) return { data: [], error: null };

  const baseCols = 'id, host_driver_id, sub_driver_id, vehicle_id, created_at';
  let fleet: DriverFleetRow[] = [];

  const withStatus = await supabase
    .from('driver_fleet')
    .select(`${baseCols}, status`)
    .eq('sub_driver_id', id)
    .order('created_at', { ascending: false });

  if (!withStatus.error) {
    fleet = ((withStatus.data ?? []) as DriverFleetRow[]).filter(
      (r) => fleetStatus(r) === 'pending',
    );
  } else if (isMissingFleetStatusColumn(withStatus.error.message)) {
    return {
      data: [],
      error: new Error(
        'driver_fleet.status საჭიროა — გაუშვი მიგრაცია 20260626180000_driver_fleet_status_and_booking_host.sql',
      ),
    };
  } else {
    return { data: [], error: new Error(withStatus.error.message) };
  }

  if (fleet.length === 0) return { data: [], error: null };

  const hostIds = [...new Set(fleet.map((f) => f.host_driver_id))];
  const vehicleIds = fleet.map((f) => f.vehicle_id);

  const [{ data: hosts }, { data: vehicles }] = await Promise.all([
    supabase.from(USERS_DIRECTORY).select('id, full_name').in('id', hostIds),
    supabase
      .from('vehicles')
      .select('id, model, plate, type, class')
      .in('id', vehicleIds),
  ]);

  type H = { id: string; full_name: string | null };
  type V = FleetInviteView['vehicle'];
  const hostMap = new Map((hosts as H[] ?? []).map((h) => [h.id, h.full_name]));
  const vehicleMap = new Map((vehicles as V[] ?? []).map((v) => [v!.id, v]));

  return {
    data: fleet.map((f) => ({
      ...f,
      status: 'pending' as const,
      host_full_name: hostMap.get(f.host_driver_id) ?? null,
      vehicle: vehicleMap.get(f.vehicle_id) ?? null,
    })),
    error: null,
  };
}

/** Host + accepted sub-driver ids (for company map). */
export async function fetchFleetDriverIdsAround(driverId: string): Promise<string[]> {
  const id = driverId.trim();
  if (!id) return [];

  const { data: asHost } = await supabase
    .from('driver_fleet')
    .select('sub_driver_id')
    .eq('host_driver_id', id)
    .eq('status', 'accepted');

  if (asHost?.length) {
    const subs = (asHost as { sub_driver_id: string }[]).map((r) => r.sub_driver_id);
    return [id, ...subs];
  }

  const { data: subRow } = await supabase
    .from('driver_fleet')
    .select('host_driver_id')
    .eq('sub_driver_id', id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (subRow) {
    const hostId = (subRow as { host_driver_id: string }).host_driver_id;
    const { data: siblings } = await supabase
      .from('driver_fleet')
      .select('sub_driver_id')
      .eq('host_driver_id', hostId)
      .eq('status', 'accepted');
    const subs =
      (siblings as { sub_driver_id: string }[] | null)?.map((r) => r.sub_driver_id) ?? [];
    return [hostId, ...subs];
  }

  return [id];
}

/** Host sends invite — `driver_fleet.status` = pending (sub must accept). */
export async function sendFleetInvite(
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

  const { data: subUser } = await supabase
    .from(USERS_DIRECTORY)
    .select('id, is_hired_driver, is_verified')
    .eq('id', subDriverId)
    .maybeSingle();

  if (!subUser) return { data: null, error: new Error('მძღოლი ვერ მოიძებნა') };
  const sub = subUser as { is_hired_driver?: boolean; is_verified?: boolean };
  if (!sub.is_hired_driver) {
    return { data: null, error: new Error('მხოლოდ დაქირავებული მძღოლი შეიძლება მოწვეულ იქნას') };
  }
  if (!sub.is_verified) {
    return { data: null, error: new Error('მძღოლი უნდა იყოს verified') };
  }

  const { data: existing, error: existingErr } = await supabase
    .from('driver_fleet')
    .select('id, host_driver_id, status')
    .eq('sub_driver_id', subDriverId)
    .maybeSingle();

  // Never fall through to INSERT on a failed lookup: that would bypass the
  // one-fleet-per-driver guard below and could place the driver in two fleets.
  if (existingErr) return { data: null, error: new Error(existingErr.message) };

  if (existing) {
    const ex = existing as { id: string; host_driver_id: string; status?: string };
    const st = fleetStatus(ex);
    if (st === 'accepted') {
      return { data: null, error: new Error('მძღოლი უკვე დასაქმებულია სხვა ჰოსტთან') };
    }
    if (st === 'pending' && ex.host_driver_id !== hostDriverId) {
      return { data: null, error: new Error('მძღოლს უკვე აქვს სხვა ჰოსტის მოწვევა') };
    }
    const { data, error } = await supabase
      .from('driver_fleet')
      .update({ vehicle_id: vehicleId, status: 'pending', host_driver_id: hostDriverId })
      .eq('id', ex.id)
      .select('id, host_driver_id, sub_driver_id, vehicle_id, status, created_at')
      .maybeSingle();
    if (error) return { data: null, error: new Error(error.message) };
    const row = data as DriverFleetRow;
    void notifyFleetInviteToSub({ subDriverId, hostDriverId, fleetId: row.id });
    return { data: row, error: null };
  }

  const { data, error } = await supabase
    .from('driver_fleet')
    .insert({
      host_driver_id: hostDriverId,
      sub_driver_id: subDriverId,
      vehicle_id: vehicleId,
      status: 'pending',
    })
    .select('id, host_driver_id, sub_driver_id, vehicle_id, status, created_at')
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };

  const row = data as DriverFleetRow;
  void notifyFleetInviteToSub({ subDriverId, hostDriverId, fleetId: row.id });
  return { data: row, error: null };
}

/** Sub accepts or rejects a pending fleet invite. */
export async function respondToFleetInvite(
  subDriverId: string,
  fleetId: string,
  accept: boolean,
): Promise<{ error: Error | null }> {
  const { data: row, error: fetchErr } = await supabase
    .from('driver_fleet')
    .select('id, status, sub_driver_id')
    .eq('id', fleetId)
    .eq('sub_driver_id', subDriverId)
    .maybeSingle();

  if (fetchErr) return { error: new Error(fetchErr.message) };
  if (!row) return { error: new Error('მოწვევა ვერ მოიძებნა') };
  if (fleetStatus(row as { status?: string }) !== 'pending') {
    return { error: new Error('მოწვევა უკვე განხილულია') };
  }

  if (!accept) {
    const { error } = await supabase
      .from('driver_fleet')
      .delete()
      .eq('id', fleetId)
      .eq('sub_driver_id', subDriverId);
    return { error: error ? new Error(error.message) : null };
  }

  // Re-assert `pending` in the write itself: the check above was a separate
  // read, so without this a double-tap (or a host acting in between) could
  // accept an invite that is no longer pending.
  const { data: accepted, error } = await supabase
    .from('driver_fleet')
    .update({ status: 'accepted' })
    .eq('id', fleetId)
    .eq('sub_driver_id', subDriverId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { error: new Error(error.message) };
  if (!accepted) return { error: new Error('მოწვევა უკვე განხილულია') };

  await supabase.from('users').update({ available_for_hire: false }).eq('id', subDriverId);
  return { error: null };
}

/** @deprecated Use sendFleetInvite — immediate assign without accept step. */
export async function assignSubDriverToVehicle(
  hostDriverId: string,
  vehicleId: string,
  subDriverId: string,
): Promise<{ data: DriverFleetRow | null; error: Error | null }> {
  return sendFleetInvite(hostDriverId, vehicleId, subDriverId);
}

export async function removeFleetMember(
  fleetId: string,
  hostDriverId: string,
): Promise<{ error: Error | null }> {
  const { data: row } = await supabase
    .from('driver_fleet')
    .select('sub_driver_id, status')
    .eq('id', fleetId)
    .eq('host_driver_id', hostDriverId)
    .maybeSingle();

  const { error } = await supabase
    .from('driver_fleet')
    .delete()
    .eq('id', fleetId)
    .eq('host_driver_id', hostDriverId);

  if (error) return { error: new Error(error.message) };

  const subId = (row as { sub_driver_id?: string } | null)?.sub_driver_id?.trim();
  if (subId) {
    await supabase.from('users').update({ available_for_hire: true }).eq('id', subId);
  }
  return { error: null };
}
