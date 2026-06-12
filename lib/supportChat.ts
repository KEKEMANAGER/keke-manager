import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ChatThreadType } from './bookingChat';
import { supabase } from './supabase';
import { trimUserId } from './userId';

export const SUPPORT_THREAD_TYPE: ChatThreadType = 'support';

export type SupportConversationSummary = {
  last_text: string;
  last_at: string;
  unread_count: number;
};

export type SupportInboxRow = {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  last_text: string;
  last_at: string;
  unread_count: number;
};

let cachedSupportAdminId: string | null | undefined;

function supportUserIdFromEnv(): string {
  const extra = Constants.expoConfig?.extra as { supportUserId?: string } | undefined;
  return (
    process.env.EXPO_PUBLIC_SUPPORT_USER_ID?.trim() ||
    extra?.supportUserId?.trim() ||
    ''
  );
}

/** Primary admin account that receives in-app support messages. */
export async function resolveSupportAdminUserId(): Promise<string | null> {
  const fromEnv = supportUserIdFromEnv();
  if (fromEnv) return fromEnv;

  if (cachedSupportAdminId !== undefined) return cachedSupportAdminId;

  const { data, error } = await supabase.rpc('get_support_admin_user_id');

  if (error) {
    if (__DEV__) console.warn('[supportChat] admin RPC failed:', error.message);
    // Do not cache failures — RLS/migration may be fixed on retry.
    return null;
  }

  const id = trimUserId(String(data ?? '')) || null;
  cachedSupportAdminId = id;
  return id;
}

export function resetSupportAdminCache(): void {
  cachedSupportAdminId = undefined;
}

export function isSupportThreadType(value: string | null | undefined): value is typeof SUPPORT_THREAD_TYPE {
  return value === SUPPORT_THREAD_TYPE;
}

export async function fetchSupportConversationSummary(
  userId: string,
  adminUserId: string,
): Promise<{ data: SupportConversationSummary | null; error: Error | null }> {
  const uid = trimUserId(userId);
  const aid = trimUserId(adminUserId);
  if (!uid || !aid) return { data: null, error: null };

  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, text, is_read, created_at')
    .eq('thread_type', SUPPORT_THREAD_TYPE)
    .is('booking_id', null)
    .or(
      `and(sender_id.eq.${uid},receiver_id.eq.${aid}),and(sender_id.eq.${aid},receiver_id.eq.${uid})`,
    )
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: new Error(error.message) };

  type Row = { sender_id: string; receiver_id: string; text: string; is_read: boolean; created_at: string };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return { data: null, error: null };

  const latest = rows[0]!;
  let unread = 0;
  for (const row of rows) {
    if (row.receiver_id === uid && !row.is_read) unread++;
  }

  return {
    data: {
      last_text: latest.text,
      last_at: latest.created_at,
      unread_count: unread,
    },
    error: null,
  };
}

/** Admin inbox: one row per end-user with an active support thread. */
export async function fetchSupportInbox(adminUserId: string): Promise<{
  data: SupportInboxRow[];
  error: Error | null;
}> {
  const aid = trimUserId(adminUserId);
  if (!aid) return { data: [], error: null };

  const { data, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, text, is_read, created_at')
    .eq('thread_type', SUPPORT_THREAD_TYPE)
    .is('booking_id', null)
    .or(`sender_id.eq.${aid},receiver_id.eq.${aid}`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return { data: [], error: new Error(error.message) };

  type Row = { sender_id: string; receiver_id: string; text: string; is_read: boolean; created_at: string };
  const rows = (data ?? []) as Row[];

  const byUser = new Map<string, { last_text: string; last_at: string; unread_count: number }>();
  for (const row of rows) {
    const endUserId = row.sender_id === aid ? row.receiver_id : row.sender_id;
    if (endUserId === aid) continue;

    const existing = byUser.get(endUserId);
    if (!existing) {
      byUser.set(endUserId, {
        last_text: row.text,
        last_at: row.created_at,
        unread_count: row.receiver_id === aid && !row.is_read ? 1 : 0,
      });
    } else if (row.receiver_id === aid && !row.is_read) {
      existing.unread_count++;
    }
  }

  const userIds = Array.from(byUser.keys());
  if (userIds.length === 0) return { data: [], error: null };

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', userIds);

  type UserRow = { id: string; full_name: string | null; email: string | null };
  const userMap = new Map<string, UserRow>(
    ((users ?? []) as UserRow[]).map((u) => [u.id, u]),
  );

  const inbox: SupportInboxRow[] = userIds
    .map((userId) => {
      const c = byUser.get(userId)!;
      const u = userMap.get(userId);
      return {
        user_id: userId,
        user_name: u?.full_name?.trim() || u?.email?.trim() || null,
        user_email: u?.email?.trim() || null,
        ...c,
      };
    })
    .sort((a, b) => b.last_at.localeCompare(a.last_at));

  return { data: inbox, error: null };
}

export function useSupportChatListEntry(userId: string | undefined, isAdmin: boolean) {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SupportConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId || isAdmin) {
      setAdminId(null);
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const aid = await resolveSupportAdminUserId();
    setAdminId(aid);
    if (!aid) {
      setSummary(null);
      setLoading(false);
      return;
    }
    const { data } = await fetchSupportConversationSummary(userId, aid);
    setSummary(data);
    setLoading(false);
  }, [userId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return {
    adminId,
    summary,
    reload,
    loading,
    visible: !isAdmin && !!adminId,
  };
}
