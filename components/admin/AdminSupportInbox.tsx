import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../UserAvatar';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchSupportInbox, type SupportInboxRow } from '../../lib/supportChat';
import { adminStyles } from './adminStyles';

/** While the inbox is on screen it is re-read this often, besides the live updates. */
const INBOX_POLL_MS = 8000;

function formatListTime(iso: string, yesterday: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  if (d.toDateString() === prev.toDateString()) return yesterday;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function AdminSupportInbox() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<SupportInboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  /** `silent`: a refresh in the background — no spinner, the list stays as it is on failure. */
  const load = useCallback(
    async (mode: 'initial' | 'silent' = 'initial') => {
      if (!user?.id) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
        setError(null);
      }
      try {
        const { data, error: err } = await fetchSupportInbox(user.id);
        if (err) {
          if (mode === 'initial') {
            setError(err.message);
            setRows([]);
          }
          return;
        }
        setError(null);
        setRows(Array.isArray(data) ? data : []);
        loadedOnce.current = true;
      } catch (e) {
        if (mode === 'initial') {
          setError(e instanceof Error ? e.message : t('common.error'));
          setRows([]);
        }
      } finally {
        if (mode === 'initial') setLoading(false);
      }
    },
    [user?.id, t],
  );

  // On screen: read it, follow new messages live, and re-read every few
  // seconds in case the live connection was lost while the phone slept.
  useFocusEffect(
    useCallback(() => {
      void load(loadedOnce.current ? 'silent' : 'initial');
      const uid = user?.id;
      if (!uid) return undefined;
      const ch = supabase
        .channel(`support-inbox-${uid}-${Math.random().toString(36).slice(2, 10)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${uid}` },
          () => void load('silent'),
        )
        .subscribe();
      const id = setInterval(() => void load('silent'), INBOX_POLL_MS);
      return () => {
        clearInterval(id);
        void supabase.removeChannel(ch);
      };
    }, [load, user?.id]),
  );

  function openThread(row: SupportInboxRow) {
    router.push({
      pathname: '/(app)/chat',
      params: {
        uid: row.user_id,
        name: row.user_name ?? row.user_email ?? '',
        // The conversation opens with the same face the list showed.
        avatar: row.user_avatar_url ?? '',
        threadType: 'support',
        adminTab: 'chats',
      },
    });
  }

  function roleLabel(role: string | null): string | null {
    if (role === 'driver') return t('common.driver');
    if (role === 'company') return t('common.company');
    return null;
  }

  const unreadTotal = rows.reduce((n, r) => n + (r.unread_count > 0 ? 1 : 0), 0);

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Ionicons name="headset-outline" size={20} color={COLORS.goldDark} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headTitle}>{t('supportChat.adminInboxTitle')}</Text>
          <Text style={styles.headHint}>{t('supportChat.adminInboxHint')}</Text>
        </View>
        {unreadTotal > 0 ? (
          <View style={styles.headBadge}>
            <Text style={styles.headBadgeText}>{unreadTotal}</Text>
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} /> : null}

      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="chatbubbles-outline" size={28} color={COLORS.textMuted} />
          <Text style={adminStyles.empty}>{t('supportChat.adminInboxEmpty')}</Text>
        </View>
      ) : null}

      {rows.map((row) => {
        const unread = row.unread_count > 0;
        const role = roleLabel(row.user_role);
        return (
          <Pressable
            key={row.user_id}
            onPress={() => openThread(row)}
            style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && { opacity: 0.9 }]}
          >
            <UserAvatar name={row.user_name} uri={row.user_avatar_url} size={50} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
                  {row.user_name || row.user_email || row.user_id.slice(0, 8)}
                </Text>
                {role ? (
                  <View style={styles.role}>
                    <Text style={styles.roleText}>{role}</Text>
                  </View>
                ) : null}
                <Text style={[styles.time, unread && styles.timeUnread]}>
                  {formatListTime(row.last_at, t('chat.yesterday'))}
                </Text>
              </View>
              <View style={styles.rowBottom}>
                <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                  {row.last_from_admin ? t('chat.you') : ''}
                  {row.last_text}
                </Text>
                {unread ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{row.unread_count}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  headIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: '#F7DFA8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  headHint: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  headBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBadgeText: { color: COLORS.black, fontSize: 12, fontWeight: '800' },
  emptyBox: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  rowUnread: { borderColor: COLORS.gold, backgroundColor: '#FFFDF6' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: COLORS.text, fontSize: 15, fontWeight: '700' },
  nameUnread: { fontWeight: '800' },
  role: { backgroundColor: '#F1F2F5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  roleText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  time: { marginLeft: 'auto', color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  timeUnread: { color: COLORS.goldDark, fontWeight: '800' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  preview: { flex: 1, color: COLORS.textSecondary, fontSize: 13.5 },
  previewUnread: { color: COLORS.text, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: COLORS.black, fontSize: 11, fontWeight: '800' },
});
