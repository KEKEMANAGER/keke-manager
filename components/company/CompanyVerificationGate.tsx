import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../AppLogo';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { CompanyVerificationGateMode } from '../../lib/companyVerificationGate';
import { pressableSx, sx } from '../../lib/sx';
import { useAuth } from '../../contexts/AuthContext';

type Props = {
  mode: Exclude<CompanyVerificationGateMode, 'full'>;
  rejectionReason?: string | null;
};

/**
 * What a company sees while it waits.
 *
 * A driver's gate offers an upload button, because a driver can do something
 * about his own status. A company cannot — approval is a human reading its
 * registration — so this screen offers the one useful action instead: ask the
 * server again, in case the approval has just landed.
 */
export function CompanyVerificationGate({ mode, rejectionReason }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut, refreshProfile } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const isRejected = mode === 'rejected';
  const companyName = profile?.full_name?.trim() || '';
  const contact =
    profile?.company_email?.trim() || profile?.email?.trim() || profile?.company_phone?.trim() || '';

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function onCheckAgain() {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
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
        <Text style={styles.title}>
          {isRejected
            ? t('companyVerificationGate.rejectedTitle')
            : t('companyVerificationGate.pendingTitle')}
        </Text>
        <Text style={styles.subtitle}>
          {isRejected
            ? t('companyVerificationGate.rejectedSubtitle')
            : t('companyVerificationGate.pendingSubtitle')}
        </Text>

        {companyName || contact ? (
          <View style={styles.infoBox}>
            {companyName ? <Text style={styles.infoName}>{companyName}</Text> : null}
            {contact ? <Text style={styles.infoContact}>{contact}</Text> : null}
          </View>
        ) : null}

        {isRejected && rejectionReason?.trim() ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>
              {t('companyVerificationGate.rejectionReasonLabel')}
            </Text>
            <Text style={styles.reasonText}>{rejectionReason.trim()}</Text>
          </View>
        ) : null}

        {!isRejected ? (
          <Pressable
            onPress={() => void onCheckAgain()}
            disabled={checking}
            style={({ pressed }) => [
              styles.primaryBtn,
              SHADOWS.button,
              pressed && styles.primaryBtnPressed,
            ]}
            accessibilityRole="button"
          >
            {checking ? (
              <ActivityIndicator color={COLORS.black} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('companyVerificationGate.checkAgain')}</Text>
            )}
          </Pressable>
        ) : null}

        <Text style={styles.helpText}>{t('companyVerificationGate.contactHint')}</Text>

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
    marginBottom: SPACING.md,
  },
  infoBox: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  infoName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  infoContact: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
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
  helpText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: SPACING.sm,
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
