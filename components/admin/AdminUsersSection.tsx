import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { KekeRole } from '../../contexts/AuthContext';
import {
  deleteAdminUser,
  fetchAdminUsers,
  setAdminUserBlocked,
  setAdminUserRole,
  type AdminUserRow,
} from '../../lib/adminPanel';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';
import { AdminUserDetailModal } from './AdminUserDetailModal';

export function AdminUsersSection({ searchQuery = '' }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAdminUsers();
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
      if (!silent) setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const name = (u.full_name ?? '').trim().toLowerCase();
      const email = (u.email ?? '').trim().toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [rows, searchQuery]);

  function typeLabel(u: AdminUserRow): string {
    if (u.role === 'company') return t('adminPanel.typeCompany');
    if (u.role === 'admin') return t('common.admin');
    if (u.is_hired_driver) return t('adminPanel.typeHired');
    if (u.role === 'driver' && u.is_guide_driver) return t('adminPanel.typeGuideDriver');
    if (u.role === 'driver') return t('adminPanel.typeDriver');
    return u.role ?? '—';
  }

  async function toggleBlock(u: AdminUserRow) {
    const nextBlocked = !u.is_blocked;
    setActingId(u.id);
    const { error: err } = await setAdminUserBlocked(u.id, nextBlocked);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === u.id ? { ...r, is_blocked: nextBlocked } : r)),
    );
    void load(true);
  }

  async function applyRoleForUser(userId: string, role: KekeRole) {
    setActingId(userId);
    const { error: err } = await setAdminUserRole(userId, role);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, role } : r)));
    void load(true);
  }

  function changeRole(u: AdminUserRow) {
    if (Platform.OS === 'web') {
      setRoleTarget(u);
      return;
    }
    Alert.alert(t('adminPanel.changeRole'), u.email ?? u.full_name ?? '—', [
      { text: t('adminPanel.typeDriver'), onPress: () => void applyRoleForUser(u.id, 'driver') },
      { text: t('adminPanel.typeCompany'), onPress: () => void applyRoleForUser(u.id, 'company') },
      { text: t('common.admin'), onPress: () => void applyRoleForUser(u.id, 'admin') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function applyRoleFromModal(role: KekeRole) {
    if (!roleTarget) return;
    const userId = roleTarget.id;
    setRoleTarget(null);
    void applyRoleForUser(userId, role);
  }

  function openUserDetail(u: AdminUserRow) {
    if (Platform.OS === 'web') {
      setDetailUserId(u.id);
      return;
    }
    router.push(`/(app)/admin-user/${u.id}`);
  }

  function confirmDelete(u: AdminUserRow) {
    setDeleteError(null);
    setDeleteTarget(u);
  }

  async function runDelete(userId: string) {
    setActingId(userId);
    setDeleteError(null);
    const { error: err } = await deleteAdminUser(userId);
    setActingId(null);
    if (err) {
      setDeleteError(err.message);
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setDeleteTarget(null);
    setDeleteError(null);
    setRows((prev) => prev.filter((r) => r.id !== userId));
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
        filteredRows.map((u) => (
          <View key={u.id} style={adminStyles.card}>
            <Pressable onPress={() => openUserDetail(u)} style={({ pressed }) => pressed && { opacity: 0.9 }}>
              <Text style={adminStyles.cardTitle}>{u.full_name?.trim() || u.email || '—'}</Text>
              <Text style={adminStyles.cardMeta}>{u.email}</Text>
              <Text style={adminStyles.cardMeta}>
                {t('adminPanel.userType')}: {typeLabel(u)}
              </Text>
              <Text style={styles.tapHint}>{t('adminPanel.userDetail.tapForDetails')}</Text>
            </Pressable>
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
                style={({ pressed }) => [
                  adminStyles.btnOutline,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={adminStyles.btnOutlineText}>
                  {u.is_blocked ? t('adminPanel.unblock') : t('adminPanel.block')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => changeRole(u)}
                disabled={actingId === u.id}
                style={({ pressed }) => [adminStyles.btnGold, pressed && { opacity: 0.88 }]}
              >
                <Text style={adminStyles.btnGoldText}>{t('adminPanel.changeRole')}</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(u)}
                disabled={actingId === u.id}
                style={({ pressed }) => [adminStyles.btnDanger, pressed && { opacity: 0.88 }]}
              >
                <Text style={adminStyles.btnDangerText}>{t('adminPanel.delete')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <AdminUserDetailModal
        userId={detailUserId}
        onClose={() => setDetailUserId(null)}
        onOpenUser={(nextId) => setDetailUserId(nextId)}
      />

      <Modal
        visible={!!roleTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleTarget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRoleTarget(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('adminPanel.changeRole')}</Text>
            <Text style={styles.modalSub}>
              {roleTarget?.full_name?.trim() || roleTarget?.email || '—'}
            </Text>
            {(['driver', 'company', 'admin'] as const).map((role) => (
              <Pressable
                key={role}
                onPress={() => applyRoleFromModal(role)}
                style={({ pressed }) => [styles.roleBtn, pressed && { opacity: 0.88 }]}
              >
                <Text style={styles.roleBtnText}>
                  {role === 'driver'
                    ? t('adminPanel.typeDriver')
                    : role === 'company'
                      ? t('adminPanel.typeCompany')
                      : t('common.admin')}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setRoleTarget(null)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('adminPanel.deleteTitle')}</Text>
            <Text style={styles.modalSub}>{t('adminPanel.deleteMessage')}</Text>
            <Text style={styles.modalSub}>
              {deleteTarget?.full_name?.trim() || deleteTarget?.email || '—'}
            </Text>
            {deleteError ? (
              <View style={styles.deleteErrorBox}>
                <Text style={styles.deleteErrorText}>{deleteError}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => deleteTarget && void runDelete(deleteTarget.id)}
              disabled={actingId === deleteTarget?.id}
              style={({ pressed }) => [
                styles.deleteBtn,
                (pressed || actingId === deleteTarget?.id) && { opacity: 0.88 },
              ]}
            >
              {actingId === deleteTarget?.id ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.deleteBtnText}>{t('adminPanel.deleteConfirm')}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              style={styles.modalCancel}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  modalSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: SPACING.sm,
  },
  roleBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roleBtnText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 14,
  },
  modalCancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  deleteBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
  deleteErrorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
  },
  deleteErrorText: {
    color: COLORS.error,
    fontSize: 13,
  },
  tapHint: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 4,
  },
});
