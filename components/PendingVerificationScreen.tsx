import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppLogo } from './AppLogo';
import { DeleteAccountModal } from './DeleteAccountModal';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { pressableSx, sx } from '../lib/sx';
import { useAuth } from '../contexts/AuthContext';

export function PendingVerificationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const status = profile?.verification_status?.trim();

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
        <View style={styles.iconWrap}>
          <Ionicons name="time-outline" size={40} color={COLORS.goldDark} />
        </View>
        <Text style={styles.title}>{t('authPending.title')}</Text>
        <Text style={styles.subtitle}>{t('authPending.subtitle')}</Text>
        {status ? (
          <Text style={styles.status}>
            {t('authPending.statusLabel')}: {status}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void onSignOut()}
          disabled={signingOut}
          style={pressableSx(styles.signOutBtn, (pressed) => (pressed ? styles.signOutBtnPressed : undefined))}
        >
          {signingOut ? (
            <ActivityIndicator color={COLORS.black} size="small" />
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
  title: {
    color: COLORS.text,
    fontSize: 22,
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
  status: {
    color: COLORS.goldDark,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  signOutBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    minWidth: 160,
    alignItems: 'center',
  },
  signOutBtnPressed: {
    opacity: 0.9,
  },
  signOutText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '800',
  },
  deleteBtn: {
    marginTop: SPACING.md,
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
