import type { ParticipantRole } from './bookingChat';
import { fetchLegsForMaster } from './groupBooking';
import { notifyChatMessageRecipient } from './notifications';
import type { MessageRow } from './messages';
import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import { trimUserId } from './userId';

export const CONVOY_THREAD_TYPE = 'convoy' as const;

export type ConvoyParticipant = {
  userId: string;
  role: ParticipantRole;
  fullName: string | null;
};

export async function resolveConvoyMasterId(bookingId: string): Promise<string | null> {
  const id = String(bookingId ?? '').trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, is_group_master, parent_booking_id')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as {
    id: string;
    is_group_master?: boolean | null;
    parent_booking_id?: string | null;
  };
  if (row.is_group_master === true) return row.id;
  const parent = row.parent_booking_id?.trim();
  return parent || null;
}

export async function fetchConvoyParticipants(
  masterId: string,
): Promise<{ data: ConvoyParticipant[]; error: Error | null }> {
  const master = masterId.trim();
  if (!master) return { data: [], error: new Error('master id required') };

  const { data: masterRow, error: masterErr } = await supabase
    .from('bookings')
    .select('company_id, group_code')
    .eq('id', master)
    .eq('is_group_master', true)
    .maybeSingle();

  if (masterErr) return { data: [], error: new Error(masterErr.message) };
  if (!masterRow) return { data: [], error: new Error('convoy master not found') };

  const companyId = trimUserId((masterRow as { company_id: string }).company_id);
  const { data: legs, error: legErr } = await fetchLegsForMaster(master);
  if (legErr) return { data: [], error: legErr };

  const userIds = new Set<string>();
  const roles = new Map<string, ParticipantRole>();
  if (companyId) {
    userIds.add(companyId);
    roles.set(companyId, 'company');
  }
  for (const leg of legs) {
    const driverId = trimUserId(leg.driver_id);
    if (!driverId) continue;
    userIds.add(driverId);
    roles.set(driverId, 'driver');
  }

  if (userIds.size === 0) return { data: [], error: null };

  const { data: users } = await supabase
    .from(USERS_DIRECTORY)
    .select('id, full_name')
    .in('id', [...userIds]);

  const nameMap = new Map<string, string | null>();
  for (const u of users ?? []) {
    const row = u as { id: string; full_name?: string | null };
    nameMap.set(row.id, row.full_name?.trim() || null);
  }

  const participants: ConvoyParticipant[] = [...userIds].map((userId) => ({
    userId,
    role: roles.get(userId) ?? 'driver',
    fullName: nameMap.get(userId) ?? null,
  }));

  participants.sort((a, b) => {
    if (a.role === 'company') return -1;
    if (b.role === 'company') return 1;
    return (a.fullName ?? a.userId).localeCompare(b.fullName ?? b.userId);
  });

  return { data: participants, error: null };
}

export async function canAccessConvoyChat(
  masterId: string,
  userId: string,
): Promise<boolean> {
  const { data: participants } = await fetchConvoyParticipants(masterId);
  const id = trimUserId(userId);
  if (!id) return false;
  if (!participants.some((p) => p.userId === id)) return false;
  if (participants.filter((p) => p.role === 'driver').length === 0) return false;

  const { data: master } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', masterId.trim())
    .maybeSingle();
  const status = (master as { status?: string } | null)?.status ?? '';
  return status !== 'cancelled' && status !== 'rejected' && status !== 'completed';
}

function dedupeConvoyMessages(rows: MessageRow[]): MessageRow[] {
  const seen = new Set<string>();
  const out: MessageRow[] = [];
  for (const row of rows) {
    const key = `${row.sender_id}|${row.text}|${row.created_at.slice(0, 19)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function fetchConvoyMessages(
  masterId: string,
  userId: string,
): Promise<{ data: MessageRow[]; error: Error | null }> {
  const master = masterId.trim();
  const uid = trimUserId(userId);
  if (!master || !uid) return { data: [], error: new Error('missing ids') };

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('booking_id', master)
    .eq('thread_type', CONVOY_THREAD_TYPE)
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };
  return { data: dedupeConvoyMessages((data ?? []) as MessageRow[]), error: null };
}

export async function markConvoyMessagesRead(masterId: string, userId: string): Promise<void> {
  const master = masterId.trim();
  const uid = trimUserId(userId);
  if (!master || !uid) return;

  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('booking_id', master)
    .eq('thread_type', CONVOY_THREAD_TYPE)
    .eq('receiver_id', uid)
    .eq('is_read', false);
}

async function resolveSenderDisplayName(senderId: string): Promise<string> {
  const id = trimUserId(senderId);
  if (!id) return '';
  const { data } = await supabase
    .from(USERS_DIRECTORY)
    .select('full_name')
    .eq('id', id)
    .maybeSingle();
  return (data as { full_name?: string | null } | null)?.full_name?.trim() ?? '';
}

export async function sendConvoyMessage(params: {
  senderId: string;
  masterId: string;
  text: string;
  senderRole: ParticipantRole;
}): Promise<{ error: Error | null }> {
  const text = params.text.trim();
  const master = params.masterId.trim();
  const senderId = trimUserId(params.senderId);
  if (!text || !master || !senderId) {
    return { error: new Error('invalid convoy message') };
  }

  const canSend = await canAccessConvoyChat(master, senderId);
  if (!canSend) return { error: new Error('convoy chat not available') };

  const { data: participants, error: partErr } = await fetchConvoyParticipants(master);
  if (partErr) return { error: partErr };

  const recipients = participants
    .map((p) => p.userId)
    .filter((id) => id !== senderId);

  if (recipients.length === 0) {
    return { error: new Error('no convoy recipients') };
  }

  const senderName = await resolveSenderDisplayName(senderId);
  const rows = recipients.map((receiverId) => {
    const recipient = participants.find((p) => p.userId === receiverId);
    return {
      sender_id: senderId,
      receiver_id: receiverId,
      text,
      booking_id: master,
      thread_type: CONVOY_THREAD_TYPE,
      sender_participant_role: params.senderRole,
      receiver_participant_role: recipient?.role ?? 'driver',
    };
  });

  const { error } = await supabase.from('messages').insert(rows);
  if (error) return { error: new Error(error.message) };

  void (async () => {
    for (const receiverId of recipients) {
      try {
        await notifyChatMessageRecipient({
          receiverUserId: receiverId,
          senderUserId: senderId,
          senderName,
          messageText: text,
          bookingId: master,
          threadType: CONVOY_THREAD_TYPE,
        });
      } catch {
        /* push best-effort */
      }
    }
  })();

  return { error: null };
}

export function subscribeConvoyMessages(
  masterId: string,
  userId: string,
  onIncoming: (msg: MessageRow) => void,
) {
  const master = masterId.trim();
  const uid = trimUserId(userId);
  const channelKey = `convoy-${master}-${uid}`;

  return supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const msg = payload.new as MessageRow;
        if (msg.booking_id !== master || msg.thread_type !== CONVOY_THREAD_TYPE) return;
        if (msg.receiver_id !== uid && msg.sender_id !== uid) return;
        onIncoming(msg);
      },
    )
    .subscribe();
}

export function convoyParticipantLabel(
  participant: ConvoyParticipant,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const name = participant.fullName ?? participant.userId.slice(0, 8);
  if (participant.role === 'company') {
    return `${name} (${t('convoyChat.roleCompany')})`;
  }
  return name;
}
