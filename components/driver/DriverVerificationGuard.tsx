import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  driverHasFullAppAccess,
  getDriverVerificationGateMode,
  isDriverVerificationRoute,
} from '../../lib/driverVerificationGate';
import { supabase } from '../../lib/supabase';
import { DriverVerificationGate } from './DriverVerificationGate';
import DriverVerificationScreen from '../../app/(driver)/verification';

type Props = {
  children: ReactNode;
};

export function DriverVerificationGuard({ children }: Props) {
  const { t } = useTranslation();
  const { user, profile, loading, refreshProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = user?.id;
  const onVerification = isDriverVerificationRoute(segments as string[]);
  const gateMode = getDriverVerificationGateMode(profile);
  const hasFullAccess = driverHasFullAppAccess(profile);

  useEffect(() => {
    if (!userId || loading || hasFullAccess) return;

    const channel = supabase
      .channel(`driver-verification-gate-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        () => {
          void refreshProfile();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loading, hasFullAccess, refreshProfile]);

  const blockDeepLink = useCallback(() => {
    if (loading || hasFullAccess || onVerification) return;
    router.replace('/(driver)/dashboard' as never);
  }, [loading, hasFullAccess, onVerification, router]);

  useEffect(() => {
    blockDeepLink();
  }, [blockDeepLink, segments]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (hasFullAccess) {
    return <>{children}</>;
  }

  if (onVerification) {
    return (
      <View style={styles.verificationShell}>
        <View style={[styles.verificationTopBar, { paddingTop: insets.top + SPACING.sm }]}>
          <Pressable
            onPress={() => router.replace('/(driver)/dashboard' as never)}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>{t('verificationGate.backToStatus')}</Text>
          </Pressable>
        </View>
        <DriverVerificationScreen />
      </View>
    );
  }

  return (
    <DriverVerificationGate
      mode={gateMode as 'pending' | 'submitted' | 'rejected'}
      rejectionReason={profile?.rejection_reason}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationShell: {
    flex: 1,
    backgroundColor: COLORS.background,
    width: '100%',
    ...(Platform.OS === 'web' ? { minHeight: '100%' as const } : {}),
  },
  verificationTopBar: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backBtnPressed: { opacity: 0.85 },
  backBtnText: {
    color: COLORS.goldDark,
    fontSize: 15,
    fontWeight: '700',
  },
});
