import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchUnreadMessageCount, subscribeToUnreadCount } from './messages';
import { syncAppIconBadgeCount } from './appIconBadge';
import { supabase } from './supabase';
import { setWebDocumentBaseTitle, updateWebDocumentTitle } from './webChatAlerts';

export function formatChatTabBadge(unread: number): string | number | undefined {
  if (unread <= 0) return undefined;
  return unread > 99 ? '99+' : unread;
}

const unreadRefreshListeners = new Set<() => void>();

/** Call after markMessagesRead so tab badge updates immediately. */
export function notifyChatUnreadMayHaveChanged(): void {
  for (const listener of unreadRefreshListeners) {
    listener();
  }
}

export function useChatUnreadCount(userId: string | undefined) {
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnread(0);
      void syncAppIconBadgeCount(0);
      if (Platform.OS === 'web') updateWebDocumentTitle(0);
      return;
    }
    const count = await fetchUnreadMessageCount(userId);
    setUnread(count);
    void syncAppIconBadgeCount(count);
    if (Platform.OS === 'web') {
      setWebDocumentBaseTitle(t('menu.appTitle'));
      updateWebDocumentTitle(count);
    }
  }, [userId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!userId) return;
    const channel = subscribeToUnreadCount(userId, () => {
      void refresh();
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Web: refetch when tab becomes visible (Realtime can miss events while backgrounded).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  useEffect(() => {
    unreadRefreshListeners.add(refresh);
    return () => {
      unreadRefreshListeners.delete(refresh);
    };
  }, [refresh]);

  return { unread, refresh, tabBadge: formatChatTabBadge(unread) };
}
