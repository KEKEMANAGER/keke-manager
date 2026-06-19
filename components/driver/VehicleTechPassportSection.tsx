import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  uploadMediaObject,
  vehicleTechPassportObjectPath,
  withCacheBust,
} from '../../lib/mediaUpload';
import type { VehicleRow, VehicleTechPassportKey } from '../../lib/vehicles';
import {
  saveVehicleTechPassportUrl,
  submitVehicleForVerification,
  vehicleCanSubmitForReview,
  vehicleTechPassportComplete,
  vehicleTechPassportSlotUploaded,
  type VehicleVerificationStatus,
} from '../../lib/vehicleVerification';

const SLOTS: VehicleTechPassportKey[] = ['tech_passport_front', 'tech_passport_back'];

type Props = {
  vehicle: VehicleRow | null;
  driverId: string | undefined;
  disabled?: boolean;
  embedded?: boolean;
  onUpdated: () => void;
};

function statusLabelKey(status: VehicleVerificationStatus): string {
  return `vehicleScreen.verificationStatus_${status}`;
}

export function VehicleTechPassportSection({
  vehicle,
  driverId,
  disabled,
  embedded = false,
  onUpdated,
}: Props) {
  const { t } = useTranslation();
  const [uploadingSlot, setUploadingSlot] = useState<VehicleTechPassportKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const uploadSlot = useCallback(
    async (slot: VehicleTechPassportKey) => {
      if (!vehicle || !driverId || uploadingSlot || disabled) return;
      setUploadingSlot(slot);
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t('vehicleScreen.permissionTitle'), t('vehicleScreen.permissionBody'));
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.85,
        });
        if (res.canceled || !res.assets[0]) return;

        const path = vehicleTechPassportObjectPath(vehicle.id, slot);
        const publicUrl = await uploadMediaObject(path, res.assets[0]!.uri, {
          contentType: 'image/jpeg',
        });
        const { error } = await saveVehicleTechPassportUrl(vehicle.id, driverId, slot, publicUrl);
        if (error) {
          Alert.alert(t('system.errorTitle'), error.message);
          return;
        }
        onUpdated();
      } catch (e: unknown) {
        Alert.alert(
          t('system.errorTitle'),
          e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'),
        );
      } finally {
        setUploadingSlot(null);
      }
    },
    [vehicle, driverId, uploadingSlot, disabled, onUpdated, t],
  );

  async function onSubmitForReview() {
    if (!vehicle || !driverId || submitting) return;
    if (!vehicleCanSubmitForReview(vehicle)) {
      Alert.alert(t('system.noticeTitle'), t('vehicleScreen.techPassportSubmitIncomplete'));
      return;
    }
    setSubmitting(true);
    const { error } = await submitVehicleForVerification(vehicle.id, driverId);
    setSubmitting(false);
    if (error) {
      Alert.alert(t('system.errorTitle'), error.message);
      return;
    }
    Alert.alert(t('common.success'), t('vehicleScreen.techPassportSubmitted'));
    onUpdated();
  }

  if (!vehicle) return null;

  const complete = vehicleTechPassportComplete(vehicle);
  const status = vehicle.verification_status ?? 'pending';
  const canSubmit =
    vehicleCanSubmitForReview(vehicle) &&
    status !== 'submitted' &&
    status !== 'approved';

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <View style={styles.head}>
        <Text style={[styles.title, embedded && styles.titleEmbedded]}>
          {t('vehicleScreen.techPassportSection')}
        </Text>
        <View style={[styles.badge, complete ? styles.badgeOk : styles.badgePending]}>
          <Text style={complete ? styles.badgeTextOk : styles.badgeTextPending}>
            {complete ? t('vehicleScreen.techPassportUploaded') : t('vehicleScreen.techPassportMissing')}
          </Text>
        </View>
      </View>
      <Text style={styles.hint}>{t('vehicleScreen.techPassportHint')}</Text>

      {status !== 'pending' ? (
        <Text style={styles.statusLine}>{t(statusLabelKey(status))}</Text>
      ) : null}
      {status === 'rejected' && vehicle.rejection_reason?.trim() ? (
        <Text style={styles.rejectReason}>{vehicle.rejection_reason.trim()}</Text>
      ) : null}

      {SLOTS.map((slot) => {
        const uri = vehicle[slot];
        const busted =
          uri && uri.startsWith('http')
            ? withCacheBust(uri) ?? uri
            : uri;
        const uploaded = vehicleTechPassportSlotUploaded(vehicle, slot);
        const busy = uploadingSlot === slot;
        return (
          <View key={slot} style={styles.slot}>
            <Text style={styles.slotLabel}>{t(`verificationScreen.${slot}`)}</Text>
            <Text style={styles.slotHint}>{t(`verificationScreen.${slot}Hint`)}</Text>
            {busted ? (
              <Image source={{ uri: busted }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={styles.previewPh}>
                <Text style={styles.previewPhText}>{t('verificationScreen.noPhoto')}</Text>
              </View>
            )}
            <Pressable
              onPress={() => void uploadSlot(slot)}
              disabled={busy || disabled || submitting}
              style={({ pressed }) => [
                styles.uploadBtn,
                SHADOWS.button,
                (pressed || busy) && styles.uploadBtnPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.black} />
              ) : (
                <Text style={styles.uploadBtnText}>
                  {uploaded ? t('verificationScreen.replace') : t('verificationScreen.uploadBtn')}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}

      {canSubmit ? (
        <Pressable
          onPress={() => void onSubmitForReview()}
          disabled={submitting}
          style={[styles.submitBtn, SHADOWS.button, submitting && styles.submitBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <Text style={styles.submitBtnText}>{t('vehicleScreen.submitForReview')}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  wrapEmbedded: {
    marginTop: 0,
    marginBottom: 0,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  title: { color: COLORS.text, fontSize: 15, fontWeight: '800', flex: 1 },
  titleEmbedded: { fontSize: 14 },
  hint: { color: COLORS.textMuted, fontSize: 13, lineHeight: 18, marginBottom: SPACING.sm },
  statusLine: { color: COLORS.goldDark, fontSize: 13, fontWeight: '700', marginBottom: SPACING.xs },
  rejectReason: { color: COLORS.error, fontSize: 13, lineHeight: 18, marginBottom: SPACING.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeOk: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  badgePending: {
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  badgeTextOk: { color: COLORS.success, fontSize: 11, fontWeight: '800' },
  badgeTextPending: { color: COLORS.goldDark, fontSize: 11, fontWeight: '800' },
  slot: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  slotLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  slotHint: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17, marginBottom: SPACING.sm },
  preview: {
    width: '100%',
    height: 130,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: SPACING.sm,
  },
  previewPh: {
    width: '100%',
    height: 130,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  previewPhText: { color: COLORS.textMuted, fontSize: 13 },
  uploadBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 11,
    alignItems: 'center',
  },
  uploadBtnPressed: { opacity: 0.9 },
  uploadBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 14 },
  submitBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
});
