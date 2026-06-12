import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import { trimUserId } from './userId';

export type ParticipantRole = 'company' | 'host' | 'driver';

export type ChatThreadType = 'company_host' | 'company_driver' | 'host_driver' | 'support';

export type BookingChatParties = {
  bookingId: string;
  companyId: string;
  driverId: string | null;
  hostId: string | null;
};

export type BookingChatThread = {
  threadType: ChatThreadType;
  otherUserId: string;
  otherUserName: string | null;
  myRole: ParticipantRole;
  otherRole: ParticipantRole;
  labelKey: string;
};

const THREAD_DEFS: {
  threadType: ChatThreadType;
  labelKey: string;
  roles: [ParticipantRole, ParticipantRole];
  userId: (p: BookingChatParties) => string | null;
  otherId: (p: BookingChatParties) => string | null;
}[] = [
  {
    threadType: 'company_host',
    labelKey: 'bookingChat.threadCompanyHost',
    roles: ['company', 'host'],
    userId: (p) => p.companyId,
    otherId: (p) => p.hostId,
  },
  {
    threadType: 'company_driver',
    labelKey: 'bookingChat.threadCompanyDriver',
    roles: ['company', 'driver'],
    userId: (p) => p.companyId,
    otherId: (p) => p.driverId,
  },
  {
    threadType: 'host_driver',
    labelKey: 'bookingChat.threadHostDriver',
    roles: ['host', 'driver'],
    userId: (p) => p.hostId,
    otherId: (p) => p.driverId,
  },
];

export function threadRoleForUser(
  threadType: ChatThreadType,
  userId: string,
  parties: BookingChatParties,
): ParticipantRole | null {
  const id = trimUserId(userId);
  if (!id) return null;
  for (const def of THREAD_DEFS) {
    if (def.threadType !== threadType) continue;
    const a = def.userId(parties);
    const b = def.otherId(parties);
    if (a && trimUserId(a) === id) return def.roles[0];
    if (b && trimUserId(b) === id) return def.roles[1];
  }
  return null;
}

export function threadPeerUserId(
  threadType: ChatThreadType,
  viewerUserId: string,
  parties: BookingChatParties,
): string | null {
  const id = trimUserId(viewerUserId);
  if (!id) return null;
  for (const def of THREAD_DEFS) {
    if (def.threadType !== threadType) continue;
    const a = trimUserId(def.userId(parties) ?? '');
    const b = trimUserId(def.otherId(parties) ?? '');
    if (a === id && b) return b;
    if (b === id && a) return a;
  }
  return null;
}

/** Resolve company, assigned driver, and fleet host for a booking. */
export async function resolveBookingChatParties(
  bookingId: string,
): Promise<{ data: BookingChatParties | null; error: Error | null }> {
  const id = String(bookingId ?? '').trim();
  if (!id) return { data: null, error: new Error('booking id missing') };

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('company_id, driver_id, host_driver_id')
    .eq('id', id)
    .maybeSingle();

  if (bErr) return { data: null, error: new Error(bErr.message) };
  if (!booking) return { data: null, error: null };

  const companyId = trimUserId((booking as { company_id: string }).company_id);
  const driverId = trimUserId((booking as { driver_id?: string | null }).driver_id ?? '');
  if (!companyId) return { data: null, error: new Error('company missing') };

  let hostId =
    trimUserId((booking as { host_driver_id?: string | null }).host_driver_id ?? '') || null;
  if (!hostId && driverId) {
    const { data: fleet } = await supabase
      .from('driver_fleet')
      .select('host_driver_id')
      .eq('sub_driver_id', driverId)
      .eq('status', 'accepted')
      .maybeSingle();
    hostId = trimUserId((fleet as { host_driver_id?: string } | null)?.host_driver_id ?? '') || null;
  }

  return {
    data: {
      bookingId: id,
      companyId,
      driverId: driverId || null,
      hostId,
    },
    error: null,
  };
}

export async function resolveViewerParticipantRole(
  userId: string,
  parties: BookingChatParties,
): Promise<ParticipantRole | null> {
  const id = trimUserId(userId);
  if (!id) return null;
  if (id === parties.companyId) return 'company';
  if (parties.driverId && id === parties.driverId) return 'driver';
  if (parties.hostId && id === parties.hostId) return 'host';
  return null;
}

/** Threads the viewer may open for this booking. */
export async function fetchBookingChatThreads(
  bookingId: string,
  viewerUserId: string,
): Promise<{ data: BookingChatThread[]; error: Error | null }> {
  const { data: parties, error } = await resolveBookingChatParties(bookingId);
  if (error) return { data: [], error };
  if (!parties) return { data: [], error: null };

  const viewerRole = await resolveViewerParticipantRole(viewerUserId, parties);
  if (!viewerRole) return { data: [], error: null };

  const viewerId = trimUserId(viewerUserId)!;
  const threads: BookingChatThread[] = [];

  for (const def of THREAD_DEFS) {
    const sideA = def.userId(parties);
    const sideB = def.otherId(parties);
    if (!sideA || !sideB) continue;

    const myRole =
      trimUserId(sideA) === viewerId ? def.roles[0] : trimUserId(sideB) === viewerId ? def.roles[1] : null;
    if (!myRole) continue;

    const otherUserId = trimUserId(sideA) === viewerId ? sideB : sideA;
    const otherRole = myRole === def.roles[0] ? def.roles[1] : def.roles[0];

    const { data: userRow } = await supabase
      .from(USERS_DIRECTORY)
      .select('full_name')
      .eq('id', otherUserId)
      .maybeSingle();

    threads.push({
      threadType: def.threadType,
      otherUserId,
      otherUserName: (userRow as { full_name?: string | null } | null)?.full_name ?? null,
      myRole,
      otherRole,
      labelKey: def.labelKey,
    });
  }

  return { data: threads, error: null };
}
