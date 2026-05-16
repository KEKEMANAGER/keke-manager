import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchConversations,
  subscribeToConversationList,
  type ConversationRow,
} from '../../lib/messages';
import { supabase } from '../../lib/supabase';

function formatListTime(iso: string, yesterday: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  if (d.toDateString() === prev.toDateString()) return yesterday;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function AvatarCircle({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials || '?'}</Text>
    </View>
  );
}

export default function CompanyChatListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!user?.id) {
        setConversations([]);
        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      const { data, error: err } = await fetchConversations(user.id);
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      if (err) {
        setError(t('chat.loadError'));
        return;
      }
      setError(null);
      setConversations(data);
    },
    [user?.id, t],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = subscribeToConversationList(user.id, () => void load('silent'));
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user?.id, load]);

  function openChat(item: ConversationRow) {
    router.push({
      pathname: '/(app)/chat',
      params: { uid: item.other_user_id, name: item.other_user_name ?? '' },
    });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
      <Text style={styles.title}>{t('chat.listTitle')}</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.other_user_id}
          contentContainerStyle={[
            styles.list,
            conversations.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={COLORS.gold}
              colors={[COLORS.gold]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{t('chat.emptyConversations')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openChat(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <AvatarCircle name={item.other_user_name ?? '?'} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.other_user_name || t('common.driver')}
                  </Text>
                  <Text style={styles.rowTime}>
                    {formatListTime(item.last_at, t('chat.yesterday'))}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={styles.rowLast} numberOfLines={1}>
                    {item.last_text}
                  </Text>
                  {item.unread_count > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: SPACING.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    marginBottom: SPACING.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
  },
  retryText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  list: {
    paddingTop: SPACING.xs,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    ...SHADOWS.card,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  rowPressed: {
    opacity: 0.85,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 16,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
    marginRight: SPACING.sm,
  },
  rowTime: {
    color: COLORS.textMuted,
    fontSize: 12,
    flexShrink: 0,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLast: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
    marginRight: SPACING.sm,
  },
  badge: {
    backgroundColor: COLORS.gold,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeText: {
    color: '#0f0f0f',
    fontSize: 11,
    fontWeight: '800',
  },
  separator: {
    height: SPACING.xs,
  },
});
