import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchUnreadMessageCount, subscribeToUnreadCount } from './messages';
import { supabase } from './supabase';
import { setWebDocumentBaseTitle, updateWebDocumentTitle } from './webChatAlerts';

export function formatChatTabBadge(unread: number): string | number | undefined {
  if (unread <= 0) return undefined;
  return unread > 99 ? '99+' : unread;
}

export function useChatUnreadCount(userId: string | undefined) {
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnread(0);
      if (Platform.OS === 'web') updateWebDocumentTitle(0);
      return;
    }
    const count = await fetchUnreadMessageCount(userId);
    setUnread(count);
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

  return { unread, refresh, tabBadge: formatChatTabBadge(unread) };
}
