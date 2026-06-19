import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { createElement, useRef } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  isPickupSignLogoPdf,
  type PickupSignLogoFile,
  PICKUP_SIGN_LOGO_MAX_BYTES,
  validatePickupSignLogoFile,
} from '../lib/pickupSignLogo';

type Props = {
  value: PickupSignLogoFile | null;
  onChange: (file: PickupSignLogoFile | null) => void;
  disabled?: boolean;
};

export function PickupSignLogoField({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const webInputRef = useRef<HTMLInputElement | null>(null);

  function applyFile(file: PickupSignLogoFile) {
    const errKey = validatePickupSignLogoFile(file);
    if (errKey) {
      onChange(null);
      return;
    }
    onChange(file);
  }

  async function pickNative() {
    if (disabled) return;
    const doc = await DocumentPicker.getDocumentAsync({
      type: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (doc.canceled || !doc.assets?.[0]) return;
    const asset = doc.assets[0];
    const mime = asset.mimeType ?? 'application/octet-stream';
    const size = asset.size ?? 0;
    const uri = asset.uri;
    const name = asset.name ?? 'pickup-sign';
    applyFile({ uri, name, mimeType: mime, size });
  }

  async function pickImageFallback() {
    if (disabled) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.92,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    applyFile({
      uri: asset.uri,
      name: asset.fileName ?? 'pickup-sign.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
    });
  }

  async function onPickPress() {
    if (Platform.OS === 'web') {
      webInputRef.current?.click();
      return;
    }
    try {
      await pickNative();
    } catch {
      await pickImageFallback();
    }
  }

  function onWebFileChange(event: unknown) {
    const e = event as { target?: { files?: FileList; value?: string } };
    const file = e.target?.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const uri = URL.createObjectURL(file);
    applyFile({
      uri,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
    });
  }

  const maxMb = Math.round(PICKUP_SIGN_LOGO_MAX_BYTES / (1024 * 1024));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('newBooking.pickupSignLogo.label')}</Text>
      <Text style={styles.hint}>{t('newBooking.pickupSignLogo.hint', { maxMb })}</Text>

      {Platform.OS === 'web'
        ? createElement('input', {
            ref: webInputRef,
            type: 'file',
            accept: 'image/png,image/jpeg,image/jpg,application/pdf,.png,.jpg,.jpeg,.pdf',
            style: { display: 'none' },
            onChange: onWebFileChange,
          })
        : null}

      {!value ? (
        <Pressable
          onPress={() => void onPickPress()}
          disabled={disabled}
          style={({ pressed }) => [
            styles.pickBtn,
            disabled && styles.pickBtnDisabled,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <Ionicons name="attach-outline" size={22} color={COLORS.goldDark} />
          <Text style={styles.pickBtnText}>{t('newBooking.pickupSignLogo.pickFile')}</Text>
        </Pressable>
      ) : (
        <View style={styles.previewBox}>
          {isPickupSignLogoPdf(value) ? (
            <View style={styles.pdfPreview}>
              <Ionicons name="document-text-outline" size={40} color={COLORS.goldDark} />
              <Text style={styles.pdfName} numberOfLines={2}>
                {value.name}
              </Text>
              <Text style={styles.pdfSub}>{t('newBooking.pickupSignLogo.pdfReady')}</Text>
            </View>
          ) : (
            <Image source={{ uri: value.uri }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Pressable
            onPress={() => onChange(null)}
            disabled={disabled}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            <Text style={styles.removeText}>{t('newBooking.pickupSignLogo.remove')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    borderStyle: 'dashed',
    backgroundColor: COLORS.surfaceAlt,
  },
  pickBtnDisabled: {
    opacity: 0.5,
  },
  pickBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  previewBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    gap: SPACING.md,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    maxWidth: 320,
    height: 160,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surfaceAlt,
  },
  pdfPreview: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  pdfName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  pdfSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  removeText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
