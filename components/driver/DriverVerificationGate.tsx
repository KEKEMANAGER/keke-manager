import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../AppLogo';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { DriverVerificationGateMode } from '../../lib/driverVerificationGate';
import { pressableSx, sx } from '../../lib/sx';
import { useAuth } from '../../contexts/AuthContext';

type Props = {
  mode: Exclude<DriverVerificationGateMode, 'full'>;
  rejectionReason?: string | null;
};

export function DriverVerificationGate({ mode, rejectionReason }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const isRejected = mode === 'rejected';
  const isSubmitted = mode === 'submitted';
  const title = isRejected
    ? t('verificationGate.rejectedTitle')
    : t('verificationGate.reviewTitle');
  const subtitle = isRejected
    ? t('verificationGate.rejectedSubtitle')
    : isSubmitted
      ? t('verificationGate.submittedSubtitle')
      : t('verificationGate.pendingSubtitle');

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View
      style={sx(styles.screen, {
        paddingTop: insets.top + SPACING.xl,
        paddingBottom: insets.bottom + SPACING.xl,
      })}
    >
      <AppLogo size="auth" />
      <View style={styles.card}>
        <View style={[styles.iconWrap, isRejected && styles.iconWrapRejected]}>
          <Ionicons
            name={isRejected ? 'close-circle-outline' : 'time-outline'}
            size={40}
            color={isRejected ? COLORS.error : COLORS.goldDark}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {isRejected && rejectionReason?.trim() ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>{t('verificationGate.rejectionReasonLabel')}</Text>
            <Text style={styles.reasonText}>{rejectionReason.trim()}</Text>
          </View>
        ) : null}

        {!isSubmitted ? (
          <Pressable
            onPress={() => router.push('/(driver)/verification' as never)}
            style={({ pressed }) => [
              styles.primaryBtn,
              SHADOWS.button,
              pressed && styles.primaryBtnPressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {isRejected
                ? t('verificationGate.reuploadCta')
                : t('verificationGate.uploadCta')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void onSignOut()}
          disabled={signingOut}
          style={pressableSx(styles.signOutBtn, (pressed) =>
            pressed ? styles.signOutBtnPressed : undefined,
          )}
        >
          {signingOut ? (
            <ActivityIndicator color={COLORS.textSecondary} size="small" />
          ) : (
            <Text style={styles.signOutText}>{t('common.logout')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => setDeleteModalVisible(true)}
          disabled={signingOut}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('settings.deleteAccount')}
        >
          <Text style={styles.deleteBtnText}>{t('settings.deleteAccount')}</Text>
        </Pressable>
      </View>

      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onDeleted={() => {
          setDeleteModalVisible(false);
          router.replace('/sign-in');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.xl,
    ...SHADOWS.card,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  iconWrapRejected: {
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  reasonBox: {
    width: '100%',
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  reasonLabel: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  reasonText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '800',
  },
  signOutBtn: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
  },
  signOutBtnPressed: { opacity: 0.85 },
  signOutText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {
    marginTop: SPACING.xs,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
  },
  deleteBtnPressed: { opacity: 0.85 },
  deleteBtnText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
  },
});
