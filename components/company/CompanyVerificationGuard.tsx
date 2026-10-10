import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { getCompanyVerificationGateMode } from '../../lib/companyVerificationGate';
import { supabase } from '../../lib/supabase';
import { CompanyVerificationGate } from './CompanyVerificationGate';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the whole (app) group, so there is one door and no way around it:
 * a deep link, a push notification tap and a web URL all land here first.
 */
export function CompanyVerificationGuard({ children }: Props) {
  const { user, profile, loading, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;
  const mode = getCompanyVerificationGateMode(profile);
  const hasFullAccess = mode === 'full';

  useEffect(() => {
    if (!userId || loading || hasFullAccess) return;

    // The company is sitting on this screen while the admin looks at its
    // registration. When the row flips to approved it should walk in by
    // itself — not have to guess that signing out and back in would help.
    const channel = supabase
      .channel(`company-verification-gate-${userId}`)
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

  return <CompanyVerificationGate mode={mode} rejectionReason={profile?.rejection_reason} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
