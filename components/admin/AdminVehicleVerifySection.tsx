import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { vehicleClassLabel, vehicleTypeLabel } from '../../lib/vehicleCatalog';
import { adminStyles } from './adminStyles';
import { DocumentImage } from '../DocumentImage';

function vehicleNeedsReview(status: AdminVehicleVerificationRow['verification_status']): boolean {
  return status === 'pending' || status === 'submitted';
}

type PhotoColumn =
  | 'photo_front'
  | 'photo_left'
  | 'photo_right'
  | 'photo_rear'
  | 'photo_interior'
  | 'tech_passport_front'
  | 'tech_passport_back';

/** The car itself, from every side — checked against the tech passport before approval. */
const CAR_PHOTO_SLOTS: { column: PhotoColumn; labelKey: string }[] = [
  { column: 'photo_front', labelKey: 'vehicleScreen.photoFront' },
  { column: 'photo_left', labelKey: 'vehicleScreen.photoLeft' },
  { column: 'photo_right', labelKey: 'vehicleScreen.photoRight' },
  { column: 'photo_rear', labelKey: 'vehicleScreen.photoRear' },
  { column: 'photo_interior', labelKey: 'vehicleScreen.photoInterior' },
];

const PASSPORT_SLOTS: { column: PhotoColumn; labelKey: string }[] = [
  { column: 'tech_passport_front', labelKey: 'verificationScreen.tech_passport_front' },
  { column: 'tech_passport_back', labelKey: 'verificationScreen.tech_passport_back' },
];

function photoUrl(v: AdminVehicleVerificationRow, column: PhotoColumn): string | null {
  const raw = v[column];
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function vehicleTypeDisplay(v: AdminVehicleVerificationRow): string {
  const type = v.type ? vehicleTypeLabel(v.type) : null;
  const cls = v.class ? vehicleClassLabel(v.class) : null;
  if (type && cls) return `${type} · ${cls}`;
  return type ?? cls ?? '—';
}

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
    try {
      const { data, error: err } = await fetchAdminVehicleVerificationQueue();
      if (err) {
        setError(err.message);
        setRows([]);
        onQueueCountChange?.(0);
        return;
      }
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      onQueueCountChange?.(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setRows([]);
      onQueueCountChange?.(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onQueueCountChange, t]);

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
      const type = vehicleTypeDisplay(v).toLowerCase();
      return name.includes(q) || email.includes(q) || plate.includes(q) || model.includes(q) || type.includes(q);
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

  /**
   * Approving with photos missing is still possible, but never by accident:
   * the car is approved on what the photos show, not on the passport alone.
   */
  function confirmApproveWithMissing(v: AdminVehicleVerificationRow): Promise<boolean> {
    const missing = [...CAR_PHOTO_SLOTS, ...PASSPORT_SLOTS]
      .filter((s) => !photoUrl(v, s.column))
      .map((s) => t(s.labelKey));
    if (missing.length === 0) return Promise.resolve(true);
    const title = t('adminVehicleVerify.missingPhotosTitle');
    const body = t('adminVehicleVerify.missingPhotosBody', { list: missing.join(', ') });
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${body}`) : false;
      return Promise.resolve(ok);
    }
    return new Promise((resolve) => {
      Alert.alert(title, body, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('adminVehicleVerify.approveAnyway'), onPress: () => resolve(true) },
      ]);
    });
  }

  async function onApprove(vehicle: AdminVehicleVerificationRow) {
    const vehicleId = vehicle.id;
    if (!(await confirmApproveWithMissing(vehicle))) return;
    setActingId(vehicleId);
    const { error: err } = await approveVehicleVerification(vehicleId);
    setActingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === vehicleId
          ? { ...r, verification_status: 'approved', is_verified: true, rejection_reason: null }
          : r,
      ),
    );
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
    setRows((prev) =>
      prev.map((r) =>
        r.id === vehicleId
          ? {
              ...r,
              verification_status: 'rejected',
              is_verified: false,
              rejection_reason: reason,
              is_active: false,
            }
          : r,
      ),
    );
    Alert.alert(t('common.success'), t('adminVehicleVerify.rejectSuccess'));
    void load(true);
  }

  /** A thumbnail of one photo; tap it for the full-size view. */
  function photoTile(v: AdminVehicleVerificationRow, column: PhotoColumn, labelKey: string) {
    const url = photoUrl(v, column);
    return (
      <Pressable
        key={column}
        disabled={!url}
        onPress={() => url && setPreview({ url, title: t(labelKey) })}
        style={({ pressed }) => [styles.tile, pressed && url && styles.tilePressed]}
      >
        {url ? (
          <DocumentImage uri={url} style={styles.tileImage} resizeMode="cover" />
        ) : (
          <View style={[styles.tileImage, styles.tileEmpty]}>
            <Text style={styles.tileEmptyText}>{t('adminVerify.noDocument')}</Text>
          </View>
        )}
        <Text style={[styles.tileLabel, !url && styles.tileLabelMissing]} numberOfLines={2}>
          {t(labelKey)}
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
              {v.plate?.trim() || v.model?.trim() || v.id.slice(0, 8)}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.driver')}: {v.driver_name?.trim() || v.driver_email || '—'}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.vehicleType')}: {vehicleTypeDisplay(v)}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.plate')}: {v.plate?.trim() || '—'}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVerify.status')}: {t(`vehicleScreen.verificationStatus_${v.verification_status}`)}
            </Text>
            {vehicleNeedsReview(v.verification_status) ? (
              <>
                <Text style={styles.groupLabel}>{t('adminVehicleVerify.carPhotos')}</Text>
                <View style={styles.tileGrid}>
                  {CAR_PHOTO_SLOTS.map((s) => photoTile(v, s.column, s.labelKey))}
                </View>
                <Text style={styles.groupLabel}>{t('adminVehicleVerify.techPassport')}</Text>
                <View style={styles.tileGrid}>
                  {PASSPORT_SLOTS.map((s) => photoTile(v, s.column, s.labelKey))}
                </View>
                <View style={adminStyles.btnRow}>
                  <Pressable
                    onPress={() => void onApprove(v)}
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
              </>
            ) : null}
          </View>
        ))
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.url ? (
              <DocumentImage
                uri={preview.url}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => setPreview(null)}
              />
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
  groupLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  tile: { width: '31%', minWidth: 92, flexGrow: 0 },
  tilePressed: { opacity: 0.85 },
  tileImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tileEmpty: { alignItems: 'center', justifyContent: 'center' },
  tileEmptyText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  tileLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 4 },
  tileLabelMissing: { color: COLORS.error },
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
    flex: 1,
  },
  previewTitle: { color: COLORS.text, fontWeight: '700', marginBottom: SPACING.sm },
  previewImage: { width: '100%', flex: 1, minHeight: 320 },
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
