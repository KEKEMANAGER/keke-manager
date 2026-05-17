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
import type { KekeRole } from '../../contexts/AuthContext';
import {
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUserRow,
} from '../../lib/adminPanel';
import { COLORS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';

export function AdminUsersSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminUsers();
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function typeLabel(u: AdminUserRow): string {
    if (u.role === 'company') return t('adminPanel.typeCompany');
    if (u.role === 'admin') return t('common.admin');
    if (u.is_hired_driver) return t('adminPanel.typeHired');
    if (u.role === 'driver') return t('adminPanel.typeDriver');
    return u.role ?? '—';
  }

  async function toggleBlock(u: AdminUserRow) {
    setActingId(u.id);
    const { error: err } = await updateAdminUser(u.id, { is_blocked: !u.is_blocked });
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    await load();
  }

  function changeRole(u: AdminUserRow) {
    const apply = (role: KekeRole) => {
      void (async () => {
        setActingId(u.id);
        const { error: err } = await updateAdminUser(u.id, { role });
        setActingId(null);
        if (err) Alert.alert(t('system.errorTitle'), err.message);
        else await load();
      })();
    };
    Alert.alert(t('adminPanel.changeRole'), u.email ?? u.full_name ?? '—', [
      { text: t('adminPanel.typeDriver'), onPress: () => apply('driver') },
      { text: t('adminPanel.typeCompany'), onPress: () => apply('company') },
      { text: t('common.admin'), onPress: () => apply('admin') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function confirmDelete(u: AdminUserRow) {
    Alert.alert(t('adminPanel.deleteTitle'), t('adminPanel.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('adminPanel.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActingId(u.id);
            const { error: err } = await deleteAdminUser(u.id);
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
      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminPanel.usersEmpty')}</Text>
      ) : (
        rows.map((u) => (
          <View key={u.id} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle}>{u.full_name?.trim() || u.email || '—'}</Text>
            <Text style={adminStyles.cardMeta}>{u.email}</Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminPanel.userType')}: {typeLabel(u)}
            </Text>
            {u.is_blocked ? (
              <View style={[adminStyles.badge, adminStyles.badgeDanger]}>
                <Text style={[adminStyles.badgeText, adminStyles.badgeDangerText]}>
                  {t('adminPanel.blocked')}
                </Text>
              </View>
            ) : null}
            <View style={adminStyles.btnRow}>
              <Pressable
                onPress={() => void toggleBlock(u)}
                disabled={actingId === u.id}
                style={adminStyles.btnOutline}
              >
                <Text style={adminStyles.btnOutlineText}>
                  {u.is_blocked ? t('adminPanel.unblock') : t('adminPanel.block')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => changeRole(u)}
                disabled={actingId === u.id}
                style={adminStyles.btnGold}
              >
                <Text style={adminStyles.btnGoldText}>{t('adminPanel.changeRole')}</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(u)}
                disabled={actingId === u.id}
                style={adminStyles.btnDanger}
              >
                <Text style={adminStyles.btnDangerText}>{t('adminPanel.delete')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
