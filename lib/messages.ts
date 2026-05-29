import type { ChatThreadType, ParticipantRole } from './bookingChat';
import { notifyChatMessageRecipient } from './notifications';
import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';
import { trimUserId } from './userId';

/** Bookings where company and driver may chat (assigned driver required). */
const CHAT_BOOKING_STATUSES = ['accepted', 'confirmed', 'in_progress', 'completed'] as const;

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  booking_id: string | null;
  thread_type?: ChatThreadType | null;
  sender_participant_role?: ParticipantRole | null;
  receiver_participant_role?: ParticipantRole | null;
  text: string;
  is_read: boolean;
  created_at: string;
};

export type ConversationRow = {
  other_user_id: string;
  other_user_name: string | null;
  other_user_avatar_url: string | null;
  last_text: string;
  last_at: string;
  unread_count: number;
};

export async function fetchMessages(
  userId: string,
  otherUserId: string,
  options?: { bookingId?: string; threadType?: ChatThreadType },
): Promise<{ data: MessageRow[]; error: Error | null }> {
  let query = supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
    );

  const bookingId = options?.bookingId?.trim();
  const threadType = options?.threadType;
  if (bookingId && threadType) {
    query = query.eq('booking_id', bookingId).eq('thread_type', threadType);
  }

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as MessageRow[], error: null };
}

async function resolveSenderDisplayName(senderId: string): Promise<string> {
  const id = trimUserId(senderId);
  if (!id) return '';
  const { data } = await supabase
    .from(USERS_DIRECTORY)
    .select('full_name')
    .eq('id', id)
    .maybeSingle();
  const name = (data as { full_name?: string | null } | null)?.full_name?.trim() ?? '';
  return name;
}

export async function sendMessage(params: {
  senderId: string;
  receiverId: string;
  text: string;
  bookingId?: string | null;
  threadType?: ChatThreadType | null;
  senderRole?: ParticipantRole | null;
  receiverRole?: ParticipantRole | null;
  /** Display name used in push notification; resolved from `users` when omitted. */
  senderName?: string;
}): Promise<{ data: MessageRow | null; error: Error | null }> {
  const text = params.text.trim();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      text,
      booking_id: params.bookingId ?? null,
      thread_type: params.threadType ?? null,
      sender_participant_role: params.senderRole ?? null,
      receiver_participant_role: params.receiverRole ?? null,
    })
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };

  void (async () => {
    try {
      const senderName =
        params.senderName?.trim() || (await resolveSenderDisplayName(params.senderId));
      await notifyChatMessageRecipient({
        receiverUserId: params.receiverId,
        senderUserId: params.senderId,
        senderName,
        messageText: text,
        bookingId: params.bookingId ?? undefined,
        threadType: params.threadType ?? undefined,
      });
    } catch (e) {
      if (__DEV__) {
        console.warn('[sendMessage] push failed:', e instanceof Error ? e.message : e);
      }
    }
  })();

  return { data: data as MessageRow, error: null };
}

export async function markMessagesRead(
  userId: string,
  otherUserId: string,
  options?: { bookingId?: string; threadType?: ChatThreadType },
): Promise<void> {
  let query = supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .eq('sender_id', otherUserId)
    .eq('is_read', false);

  const bookingId = options?.bookingId?.trim();
  if (bookingId && options?.threadType) {
    query = query.eq('booking_id', bookingId).eq('thread_type', options.threadType);
  }

  await query;
}

async function mergeChatPartnersFromBookings(
  userId: string,
  seen: Map<string, { last_text: string; last_at: string; unread_count: number }>,
): Promise<Error | null> {
  const id = trimUserId(userId);
  if (!id) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('company_id, driver_id, updated_at')
    .or(`company_id.eq.${id},driver_id.eq.${id}`)
    .in('status', [...CHAT_BOOKING_STATUSES])
    .not('driver_id', 'is', null);

  if (error) return new Error(error.message);

  for (const row of data ?? []) {
    const companyId = trimUserId((row as { company_id: string }).company_id);
    const driverId = trimUserId((row as { driver_id: string | null }).driver_id);
    const otherId = companyId === id ? driverId : companyId;
    if (!otherId || otherId === id) continue;

    const at = String((row as { updated_at?: string }).updated_at ?? '').trim() || new Date().toISOString();
    const existing = seen.get(otherId);
    if (!existing) {
      seen.set(otherId, { last_text: '', last_at: at, unread_count: 0 });
    } else if (at > existing.last_at) {
      existing.last_at = at;
    }
  }

  return null;
}

export async function fetchConversations(userId: string): Promise<{
  data: ConversationRow[];
  error: Error | null;
}> {
  const id = trimUserId(userId);
  if (!id) return { data: [], error: null };

  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, text, is_read, created_at')
    .or(`sender_id.eq.${id},receiver_id.eq.${id}`)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };

  type MsgLite = Pick<MessageRow, 'sender_id' | 'receiver_id' | 'text' | 'is_read' | 'created_at'>;
  const rows = (data ?? []) as MsgLite[];

  const seen = new Map<string, { last_text: string; last_at: string; unread_count: number }>();
  for (const msg of rows) {
    const otherId = msg.sender_id === id ? msg.receiver_id : msg.sender_id;
    if (!seen.has(otherId)) {
      seen.set(otherId, {
        last_text: msg.text,
        last_at: msg.created_at,
        unread_count: msg.receiver_id === id && !msg.is_read ? 1 : 0,
      });
    } else {
      const c = seen.get(otherId)!;
      if (msg.receiver_id === id && !msg.is_read) c.unread_count++;
    }
  }

  const bookingErr = await mergeChatPartnersFromBookings(id, seen);
  if (bookingErr) return { data: [], error: bookingErr };

  const otherIds = Array.from(seen.keys());
  if (otherIds.length === 0) return { data: [], error: null };

  const { data: users } = await supabase
    .from(USERS_DIRECTORY)
    .select('id, full_name, avatar_url')
    .in('id', otherIds);

  type UserLite = { id: string; full_name: string | null; avatar_url: string | null };
  const userMap = new Map<string, UserLite>(
    ((users ?? []) as UserLite[]).map((u) => [u.id, u]),
  );

  const conversations: ConversationRow[] = Array.from(seen.entries())
    .map(([otherId, c]) => ({
      other_user_id: otherId,
      other_user_name: userMap.get(otherId)?.full_name ?? null,
      other_user_avatar_url: userMap.get(otherId)?.avatar_url ?? null,
      ...c,
    }))
    .sort((a, b) => b.last_at.localeCompare(a.last_at));

  return { data: conversations, error: null };
}

export function subscribeToMessages(
  userId: string,
  otherUserId: string,
  onIncoming: (msg: MessageRow) => void,
  options?: { bookingId?: string; threadType?: ChatThreadType },
) {
  const bookingId = options?.bookingId?.trim();
  const threadType = options?.threadType;
  const channelKey = bookingId && threadType
    ? `msgs-${bookingId}-${threadType}`
    : `msgs-${[userId, otherUserId].sort().join('-')}`;

  return supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const msg = payload.new as MessageRow;
        if (msg.sender_id !== otherUserId || msg.receiver_id !== userId) return;
        if (bookingId && threadType) {
          if (msg.booking_id !== bookingId || msg.thread_type !== threadType) return;
        }
        onIncoming(msg);
      },
    )
    .subscribe();
}

export function subscribeToConversationList(
  userId: string,
  onChange: (msg?: MessageRow) => void,
) {
  // Unique channel per subscription — multiple subscribers (e.g. layout + chat-list)
  // share the same realtime topic without colliding on `supabase.channel(name)` reuse.
  const channelName = `convlist-${userId}-${Math.random().toString(36).slice(2, 10)}`;
  return supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        const msg = (payload.new as MessageRow | undefined) ?? undefined;
        onChange(msg);
      },
    )
    .subscribe();
}
