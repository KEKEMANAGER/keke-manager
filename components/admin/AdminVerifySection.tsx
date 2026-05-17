import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  approveUserVerification,
  documentUrlFor,
  fetchAdminVerificationQueue,
  rejectUserVerification,
  verificationDocSlotsForAdmin,
  type AdminDocumentKey,
  type AdminVerificationUser,
} from '../../lib/adminVerification';
import { adminStyles } from './adminStyles';

type DocSlot = { key: AdminDocumentKey; labelKey: string };

function idDocSlotsForUser(u: AdminVerificationUser): DocSlot[] {
  return verificationDocSlotsForAdmin(u).map((key) => ({
    key,
    labelKey: `verificationScreen.${key}`,
  }));
}

const VEHICLE_PHOTO_SLOTS: DocSlot[] = [
  { key: 'vehicle_front', labelKey: 'vehicleScreen.photoFront' },
  { key: 'vehicle_left', labelKey: 'vehicleScreen.photoLeft' },
  { key: 'vehicle_right', labelKey: 'vehicleScreen.photoRight' },
  { key: 'vehicle_interior', labelKey: 'vehicleScreen.photoInterior' },
  { key: 'vehicle_rear', labelKey: 'vehicleScreen.photoRear' },
];

export function AdminVerifySection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminVerificationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const rejectResolveRef = useRef<((value: string | null) => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminVerificationQueue();
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

  function promptRejectReason(): Promise<string | null> {
    if (Platform.OS === 'web') {
      const v =
        typeof window !== 'undefined' ? window.prompt(t('adminVerify.rejectReasonWeb'), '') : null;
      const trimmed = v?.trim();
      return Promise.resolve(trimmed && trimmed.length > 0 ? trimmed : null);
    }
    if (Platform.OS === 'ios') {
      return new Promise((resolve) => {
        Alert.prompt(
          t('adminVerify.rejectTitle'),
          t('adminVerify.rejectPrompt'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
            {
              text: t('adminVerify.confirmYes'),
              onPress: (text?: string) => {
                const r = (text ?? '').trim();
                resolve(r.length > 0 ? r : null);
              },
            },
          ],
          'plain-text',
        );
      });
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
  }

  function cancelRejectModal() {
    rejectResolveRef.current?.(null);
    rejectResolveRef.current = null;
    setRejectModalOpen(false);
    setRejectReason('');
  }

  async function onApprove(targetUserId: string) {
    setActingId(targetUserId);
    const { error: err } = await approveUserVerification(targetUserId);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    Alert.alert(t('common.success'), t('adminVerify.approveSuccess'));
    await load();
  }

  async function onReject(targetUserId: string) {
    const reason = await promptRejectReason();
    if (reason == null) return;
    setActingId(targetUserId);
    const { error: err } = await rejectUserVerification(targetUserId, reason);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    Alert.alert(t('common.success'), t('adminVerify.rejectSuccess'));
    await load();
  }

  function roleLabel(role: string | null): string {
    if (role === 'driver') return t('authScreen.roleFreelanceDriver');
    if (role === 'company') return t('authScreen.roleCompany');
    if (role === 'admin') return t('common.admin');
    return role ?? '—';
  }

  function statusLabel(status: string | null): string {
    if (status === 'pending') return t('adminVerify.statusPending');
    if (status === 'submitted') return t('adminVerify.statusSubmitted');
    return status ?? '—';
  }

  function renderDocButton(user: AdminVerificationUser, slot: DocSlot) {
    const url = documentUrlFor(user, slot.key);
    return (
      <Pressable
        key={slot.key}
        disabled={!url}
        onPress={() => url && setPreview({ url, title: t(slot.labelKey) })}
        style={({ pressed }) => [
          styles.docBtn,
          !url && styles.docBtnDisabled,
          pressed && url && styles.docBtnPressed,
        ]}
      >
        <Text style={[styles.docBtnText, !url && styles.docBtnTextDisabled]} numberOfLines={1}>
          {t(slot.labelKey)}
        </Text>
        <Text style={[styles.docBtnHint, !url && styles.docBtnTextDisabled]}>
          {url ? t('adminVerify.viewDocument') : t('adminVerify.noDocument')}
        </Text>
      </Pressable>
    );
  }

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />;
  }

  return (
    <>
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
          <Text style={adminStyles.empty}>{t('adminVerify.emptyPending')}</Text>
        ) : (
          rows.map((u) => (
            <View key={u.id} style={adminStyles.card}>
              <Text style={adminStyles.cardTitle}>{u.full_name?.trim() || u.email || '—'}</Text>
              <Text style={adminStyles.cardMeta}>
                {t('adminVerify.role')}: {roleLabel(u.role)}
              </Text>
              <Text style={adminStyles.cardMeta}>
                {t('adminVerify.status')}: {statusLabel(u.verification_status)}
              </Text>
              <Text style={styles.sectionLabel}>{t('adminVerify.documentsSection')}</Text>
              <View style={styles.docGrid}>
                {idDocSlotsForUser(u).map((slot) => renderDocButton(u, slot))}
              </View>
              {u.role === 'driver' && !u.is_hired_driver ? (
                <>
                  <Text style={styles.sectionLabel}>{t('adminVerify.vehiclePhotos')}</Text>
                  <View style={styles.docGrid}>
                    {VEHICLE_PHOTO_SLOTS.map((slot) => renderDocButton(u, slot))}
                  </View>
                  <View style={styles.thumbRow}>
                    {VEHICLE_PHOTO_SLOTS.map((slot) => {
                      const url = documentUrlFor(u, slot.key);
                      return url ? (
                        <Pressable
                          key={slot.key}
                          onPress={() => setPreview({ url, title: t(slot.labelKey) })}
                        >
                          <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                        </Pressable>
                      ) : (
                        <View key={slot.key} style={[styles.thumb, styles.thumbPh]} />
                      );
                    })}
                  </View>
                </>
              ) : null}
              <View style={adminStyles.btnRow}>
                <Pressable
                  onPress={() => void onApprove(u.id)}
                  disabled={actingId === u.id}
                  style={({ pressed }) => [
                    styles.approve,
                    (pressed || actingId === u.id) && { opacity: 0.88 },
                  ]}
                >
                  {actingId === u.id ? (
                    <ActivityIndicator color="#0f0f0f" />
                  ) : (
                    <Text style={styles.approveText}>{t('adminVerify.approveAction')}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => void onReject(u.id)}
                  disabled={actingId === u.id}
                  style={({ pressed }) => [
                    styles.reject,
                    (pressed || actingId === u.id) && { opacity: 0.88 },
                  ]}
                >
                  <Text style={styles.rejectText}>{t('adminVerify.rejectAction')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

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
  sectionLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  docBtn: {
    minWidth: '30%',
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
  docBtnText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  docBtnHint: { color: COLORS.gold, fontSize: 11, fontWeight: '600' },
  docBtnTextDisabled: { color: COLORS.textMuted },
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  thumb: {
    width: 56,
    height: 42,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  thumbPh: { borderWidth: 1, borderColor: COLORS.border },
  approve: {
    flex: 1,
    minWidth: 140,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveText: { color: '#0f0f0f', fontWeight: '800', fontSize: 14 },
  reject: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rejectText: { color: COLORS.error, fontWeight: '800', fontSize: 14 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    maxHeight: '90%',
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: 360,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  previewClose: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
  },
  previewCloseText: { color: '#0f0f0f', fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: SPACING.md,
    color: COLORS.text,
    minHeight: 88,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: COLORS.grayLight, fontWeight: '600' },
  modalOk: {
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalOkText: { color: '#0f0f0f', fontWeight: '800' },
});
