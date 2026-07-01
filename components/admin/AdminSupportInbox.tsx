import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../UserAvatar';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSupportInbox, type SupportInboxRow } from '../../lib/supportChat';
import { adminStyles } from './adminStyles';

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

export function AdminSupportInbox() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<SupportInboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchSupportInbox(user.id);
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openThread(row: SupportInboxRow) {
    router.push({
      pathname: '/(app)/chat',
      params: {
        uid: row.user_id,
        name: row.user_name ?? row.user_email ?? '',
        threadType: 'support',
      },
    });
  }

  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={[adminStyles.cardTitle, { marginBottom: SPACING.xs }]}>
        {t('supportChat.adminInboxTitle')}
      </Text>
      <Text style={[adminStyles.cardMeta, { marginBottom: SPACING.sm }]}>
        {t('supportChat.adminInboxHint')}
      </Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.md }} />
      ) : null}

      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('supportChat.adminInboxEmpty')}</Text>
      ) : null}

      {rows.map((row) => (
        <Pressable
          key={row.user_id}
          onPress={() => openThread(row)}
          style={({ pressed }) => [adminStyles.card, pressed && { opacity: 0.9 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
            <UserAvatar name={row.user_name} uri={null} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={adminStyles.cardTitle} numberOfLines={1}>
                  {row.user_name || row.user_email || row.user_id.slice(0, 8)}
                </Text>
                <Text style={adminStyles.cardMeta}>
                  {formatListTime(row.last_at, t('chat.yesterday'))}
                </Text>
              </View>
              <Text style={[adminStyles.cardMeta, { marginTop: 4 }]} numberOfLines={1}>
                {row.last_text}
              </Text>
            </View>
            {row.unread_count > 0 ? (
              <View
                style={{
                  backgroundColor: COLORS.gold,
                  borderRadius: 999,
                  minWidth: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ color: '#0f0f0f', fontSize: 11, fontWeight: '800' }}>
                  {row.unread_count}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
