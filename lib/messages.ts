import { supabase } from './supabase';

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  booking_id: string | null;
  text: string;
  is_read: boolean;
  created_at: string;
};

export type ConversationRow = {
  other_user_id: string;
  other_user_name: string | null;
  last_text: string;
  last_at: string;
  unread_count: number;
};

export async function fetchMessages(
  userId: string,
  otherUserId: string,
): Promise<{ data: MessageRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`,
    )
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as MessageRow[], error: null };
}

export async function sendMessage(params: {
  senderId: string;
  receiverId: string;
  text: string;
  bookingId?: string | null;
}): Promise<{ data: MessageRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      text: params.text.trim(),
      booking_id: params.bookingId ?? null,
    })
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as MessageRow, error: null };
}

export async function markMessagesRead(
  userId: string,
  otherUserId: string,
): Promise<void> {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .eq('sender_id', otherUserId)
    .eq('is_read', false);
}

export async function fetchConversations(userId: string): Promise<{
  data: ConversationRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, text, is_read, created_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: new Error(error.message) };

  type MsgLite = Pick<MessageRow, 'sender_id' | 'receiver_id' | 'text' | 'is_read' | 'created_at'>;
  const rows = (data ?? []) as MsgLite[];

  const seen = new Map<string, { last_text: string; last_at: string; unread_count: number }>();
  for (const msg of rows) {
    const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    if (!seen.has(otherId)) {
      seen.set(otherId, {
        last_text: msg.text,
        last_at: msg.created_at,
        unread_count: msg.receiver_id === userId && !msg.is_read ? 1 : 0,
      });
    } else {
      const c = seen.get(otherId)!;
      if (msg.receiver_id === userId && !msg.is_read) c.unread_count++;
    }
  }

  const otherIds = Array.from(seen.keys());
  if (otherIds.length === 0) return { data: [], error: null };

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('id', otherIds);

  const nameMap = new Map<string, string | null>(
    ((users ?? []) as { id: string; full_name: string | null }[]).map((u) => [u.id, u.full_name]),
  );

  return {
    data: Array.from(seen.entries()).map(([otherId, c]) => ({
      other_user_id: otherId,
      other_user_name: nameMap.get(otherId) ?? null,
      ...c,
    })),
    error: null,
  };
}

export function subscribeToMessages(
  userId: string,
  otherUserId: string,
  onIncoming: (msg: MessageRow) => void,
) {
  return supabase
    .channel(`msgs-${[userId, otherUserId].sort().join('-')}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const msg = payload.new as MessageRow;
        if (msg.sender_id === otherUserId && msg.receiver_id === userId) {
          onIncoming(msg);
        }
      },
    )
    .subscribe();
}

export function subscribeToConversationList(userId: string, onChange: () => void) {
  return supabase
    .channel(`convlist-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();
}
