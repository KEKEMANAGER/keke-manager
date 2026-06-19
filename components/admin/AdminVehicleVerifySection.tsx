import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import {
  approveVehicleVerification,
  fetchAdminVehicleVerificationQueue,
  rejectVehicleVerification,
  type AdminVehicleVerificationRow,
} from '../../lib/vehicleVerification';
import { adminStyles } from './adminStyles';

export function AdminVehicleVerifySection({
  searchQuery = '',
  onQueueCountChange,
}: {
  searchQuery?: string;
  onQueueCountChange?: (count: number) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminVehicleVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [, setRejectTargetId] = useState<string | null>(null);
  const rejectResolveRef = useRef<((value: string | null) => void) | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminVehicleVerificationQueue();
    if (!silent) setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      onQueueCountChange?.(0);
      return;
    }
    setRows(data);
    onQueueCountChange?.(data.length);
  }, [onQueueCountChange]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((v) => {
      const name = (v.driver_name ?? '').trim().toLowerCase();
      const email = (v.driver_email ?? '').trim().toLowerCase();
      const plate = (v.plate ?? '').trim().toLowerCase();
      const model = (v.model ?? '').trim().toLowerCase();
      return name.includes(q) || email.includes(q) || plate.includes(q) || model.includes(q);
    });
  }, [rows, searchQuery]);

  function promptRejectReason(): Promise<string | null> {
    if (Platform.OS === 'web') {
      const v =
        typeof window !== 'undefined' ? window.prompt(t('adminVerify.rejectReasonWeb'), '') : null;
      const trimmed = v?.trim();
      return Promise.resolve(trimmed && trimmed.length > 0 ? trimmed : null);
    }
    setRejectReason('');
    setRejectModalOpen(true);
    return new Promise((resolve) => {
      rejectResolveRef.current = resolve;
    });
  }

  function confirmRejectModal() {
    const r = rejectReason.trim();
    rejectResolveRef.current?.(r.length > 0 ? r : null);
    rejectResolveRef.current = null;
    setRejectModalOpen(false);
    setRejectReason('');
    setRejectTargetId(null);
  }

  function cancelRejectModal() {
    rejectResolveRef.current?.(null);
    rejectResolveRef.current = null;
    setRejectModalOpen(false);
    setRejectReason('');
    setRejectTargetId(null);
  }

  async function onApprove(vehicleId: string) {
    setActingId(vehicleId);
    const { error: err } = await approveVehicleVerification(vehicleId);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== vehicleId));
    Alert.alert(t('common.success'), t('adminVehicleVerify.approveSuccess'));
    void load(true);
  }

  async function onReject(vehicleId: string) {
    const reason = await promptRejectReason();
    if (reason == null) return;
    setActingId(vehicleId);
    const { error: err } = await rejectVehicleVerification(vehicleId, reason);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== vehicleId));
    Alert.alert(t('common.success'), t('adminVehicleVerify.rejectSuccess'));
    void load(true);
  }

  function docButton(v: AdminVehicleVerificationRow, url: string | null, labelKey: string) {
    return (
      <Pressable
        key={labelKey}
        disabled={!url}
        onPress={() => url && setPreview({ url, title: t(labelKey) })}
        style={({ pressed }) => [
          styles.docBtn,
          !url && styles.docBtnDisabled,
          pressed && url && styles.docBtnPressed,
        ]}
      >
        <Text style={[styles.docBtnText, !url && styles.docBtnTextDisabled]} numberOfLines={1}>
          {t(labelKey)}
        </Text>
        <Text style={[styles.docBtnHint, !url && styles.docBtnTextDisabled]}>
          {url ? t('adminVerify.viewDocument') : t('adminVerify.noDocument')}
        </Text>
      </Pressable>
    );
  }

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.lg }} size="large" />;
  }

  return (
    <>
      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {filteredRows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminVehicleVerify.emptyPending')}</Text>
      ) : (
        filteredRows.map((v) => (
          <View key={v.id} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle}>
              {v.model?.trim() || v.plate?.trim() || v.id.slice(0, 8)}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.driver')}: {v.driver_name?.trim() || v.driver_email || '—'}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.plate')}: {v.plate?.trim() || '—'}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVerify.status')}: {t(`vehicleScreen.verificationStatus_${v.verification_status}`)}
            </Text>
            <View style={styles.docGrid}>
              {docButton(v, v.tech_passport_front, 'verificationScreen.tech_passport_front')}
              {docButton(v, v.tech_passport_back, 'verificationScreen.tech_passport_back')}
            </View>
            <View style={adminStyles.btnRow}>
              <Pressable
                onPress={() => void onApprove(v.id)}
                disabled={actingId === v.id}
                style={({ pressed }) => [styles.approve, (pressed || actingId === v.id) && { opacity: 0.88 }]}
              >
                {actingId === v.id ? (
                  <ActivityIndicator color="#0f0f0f" />
                ) : (
                  <Text style={styles.approveText}>{t('adminVerify.approveAction')}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => void onReject(v.id)}
                disabled={actingId === v.id}
                style={({ pressed }) => [styles.reject, (pressed || actingId === v.id) && { opacity: 0.88 }]}
              >
                <Text style={styles.rejectText}>{t('adminVerify.rejectAction')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.url ? (
              <Image source={{ uri: preview.url }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
            <Pressable onPress={() => setPreview(null)} style={styles.previewClose}>
              <Text style={styles.previewCloseText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={rejectModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('adminVerify.modalTitle')}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t('adminVerify.modalPlaceholder')}
              placeholderTextColor={COLORS.gray}
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={cancelRejectModal} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={confirmRejectModal} style={styles.modalOk}>
                <Text style={styles.modalOkText}>{t('verificationScreen.submit')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  docBtn: {
    minWidth: '45%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: COLORS.surface,
  },
  docBtnDisabled: { opacity: 0.5 },
  docBtnPressed: { opacity: 0.88, borderColor: COLORS.gold },
  docBtnText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  docBtnTextDisabled: { color: COLORS.textMuted },
  docBtnHint: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  approve: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveText: { color: '#0f0f0f', fontWeight: '800', fontSize: 14 },
  reject: {
    flex: 1,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  rejectText: { color: COLORS.error, fontWeight: '800', fontSize: 14 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING.md,
    maxHeight: '90%',
  },
  previewTitle: { color: COLORS.text, fontWeight: '700', marginBottom: SPACING.sm },
  previewImage: { width: '100%', height: 360 },
  previewClose: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
  },
  previewCloseText: { fontWeight: '800', color: '#0f0f0f' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING.lg,
  },
  modalTitle: { color: COLORS.text, fontWeight: '800', fontSize: 16, marginBottom: SPACING.sm },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: SPACING.sm,
    minHeight: 80,
    color: COLORS.text,
    textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: '700' },
  modalOk: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.gold,
  },
  modalOkText: { color: '#0f0f0f', fontWeight: '800' },
});
