import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type DailyMessage = {
  id: string;
  message: string;
  created_at: string;
};

const STORAGE_PREFIX = '@keke/daily_motivation_seen_v1:';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Latest active admin-published motivational message, or null when there is none. */
export async function fetchLatestActiveDailyMessage(): Promise<DailyMessage | null> {
  const { data, error } = await supabase
    .from('daily_messages')
    .select('id, message, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[fetchLatestActiveDailyMessage]', error.message);
    return null;
  }
  return (data as DailyMessage | null) ?? null;
}

/** Whether this user has already dismissed today's message (or this exact message id). */
export async function getDailyMotivationSeenToday(
  userId: string,
  messageId: string,
): Promise<boolean> {
  const id = userId.trim();
  if (!id || !messageId) return true;
  const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { day?: string; messageId?: string };
    return parsed.day === todayKey() || parsed.messageId === messageId;
  } catch {
    return false;
  }
}

export async function setDailyMotivationSeen(userId: string, messageId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;
  await AsyncStorage.setItem(
    `${STORAGE_PREFIX}${id}`,
    JSON.stringify({ day: todayKey(), messageId }),
  );
}

/**
 * Fetches the latest active daily message (once, on mount / when `userId` changes) and
 * shows it — unless this user already dismissed it today. Used by both the company and
 * driver dashboards.
 */
export function useDailyMotivation(userId: string | null | undefined): {
  visible: boolean;
  message: string;
  dismiss: () => void;
} {
  const [current, setCurrent] = useState<DailyMessage | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = (userId ?? '').trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const latest = await fetchLatestActiveDailyMessage();
      if (cancelled || !latest) return;
      const alreadySeen = await getDailyMotivationSeenToday(id, latest.id);
      if (cancelled || alreadySeen) return;
      setCurrent(latest);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    const id = (userId ?? '').trim();
    if (id && current) {
      void setDailyMotivationSeen(id, current.id);
    }
  }, [userId, current]);

  return { visible, message: current?.message ?? '', dismiss };
}
