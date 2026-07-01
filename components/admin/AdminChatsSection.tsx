import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { deleteAdminMessage, fetchAdminMessages, type AdminMessageView } from '../../lib/adminPanel';
import { AdminSupportInbox } from './AdminSupportInbox';
import { COLORS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';

export function AdminChatsSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAdminMessages();
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function confirmDelete(m: AdminMessageView) {
    Alert.alert(t('adminPanel.deleteMessageTitle'), t('adminPanel.deleteMessageBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('adminPanel.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActingId(m.id);
            const { error: err } = await deleteAdminMessage(m.id);
            setActingId(null);
            if (err) Alert.alert(t('system.errorTitle'), err.message);
            else await load();
          })();
        },
      },
    ]);
  }

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />;
  }

  return (
    <View>
      <AdminSupportInbox />
      <Text style={[adminStyles.cardTitle, { marginBottom: SPACING.sm }]}>
        {t('adminPanel.allMessagesTitle')}
      </Text>
      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminPanel.chatsEmpty')}</Text>
      ) : (
        rows.map((m) => (
          <View key={m.id} style={adminStyles.card}>
            <Text style={adminStyles.cardMeta}>
              {m.sender_name ?? '—'} → {m.receiver_name ?? '—'}
            </Text>
            <Text style={[adminStyles.cardTitle, { marginTop: 6 }]}>{m.text}</Text>
            <Text style={adminStyles.cardMeta}>
              {new Date(m.created_at).toLocaleString()}
            </Text>
            <View style={adminStyles.btnRow}>
              <Pressable
                onPress={() => confirmDelete(m)}
                disabled={actingId === m.id}
                style={adminStyles.btnDanger}
              >
                <Text style={adminStyles.btnDangerText}>{t('adminPanel.deleteMessage')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
