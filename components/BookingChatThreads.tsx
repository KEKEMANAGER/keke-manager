import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fetchBookingChatThreads, type BookingChatThread } from '../lib/bookingChat';
import { COLORS, SPACING } from '../constants/theme';

type Props = {
  bookingId: string;
  viewerUserId: string;
  /** `app` = company stack, `driver` = driver stack */
  chatStack: 'app' | 'driver';
};

export function BookingChatThreads({ bookingId, viewerUserId, chatStack }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [threads, setThreads] = useState<BookingChatThread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchBookingChatThreads(bookingId, viewerUserId);
    setLoading(false);
    if (error) {
      setThreads([]);
      return;
    }
    setThreads(data);
  }, [bookingId, viewerUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} />;
  }

  if (threads.length === 0) {
    return (
      <Text style={styles.empty}>
        {t('bookingChat.noThreads')}
      </Text>
    );
  }

  const basePath = chatStack === 'app' ? '/(app)/chat' : '/(driver)/chat';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('bookingChat.sectionTitle')}</Text>
      {threads.map((thread) => (
        <Pressable
          key={thread.threadType}
          onPress={() =>
            router.push({
              pathname: basePath,
              params: {
                uid: thread.otherUserId,
                name: thread.otherUserName ?? t('common.driver'),
                bookingId,
                threadType: thread.threadType,
                senderRole: thread.myRole,
                receiverRole: thread.otherRole,
              },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.gold} />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{t(thread.labelKey)}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {thread.otherUserName ?? thread.otherUserId.slice(0, 8)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 4,
  },
  empty: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 14,
  },
  rowSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.9,
  },
});
