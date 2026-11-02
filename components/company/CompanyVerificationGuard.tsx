import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfileFix, type ProfileFixRequest } from '../../lib/companyProfileFix';
import { getCompanyVerificationGateMode } from '../../lib/companyVerificationGate';
import { supabase } from '../../lib/supabase';
import { CompanyProfileFixForm } from './CompanyProfileFixForm';
import { CompanyVerificationGate } from './CompanyVerificationGate';

type Props = {
  children: ReactNode;
};

/** What KEKE Manager asked this account to correct, as last read for it. */
type FixLookup = { userId: string; fix: ProfileFixRequest | null };

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

  // A company held until it corrects its name or logo gets the form for
  // exactly that instead of the waiting screen. Read only while it is held.
  const [lookup, setLookup] = useState<FixLookup | null>(null);
  const lookupSeq = useRef(0);
  const fix = lookup && lookup.userId === userId ? lookup.fix : undefined;

  const loadFix = useCallback(async () => {
    if (!userId) return;
    const seq = ++lookupSeq.current;
    let next: ProfileFixRequest | null = null;
    try {
      next = await fetchProfileFix(userId);
    } catch {
      next = null;
    }
    // Only the latest answer counts; an older one may land after it.
    if (seq === lookupSeq.current) setLookup({ userId, fix: next });
  }, [userId]);

  // Looked up again whenever the account is re-read (a live update, "check
  // again", a save), so a request made or withdrawn while the company is on
  // this screen shows up without signing out.
  useEffect(() => {
    if (!userId || loading || hasFullAccess) return;
    void loadFix();
  }, [userId, loading, hasFullAccess, loadFix, profile]);

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

  const onFixSaved = useCallback(async () => {
    await refreshProfile();
  }, [refreshProfile]);

  // Shown while the account loads, and on the first look-up of a request
  // only — later look-ups keep the form on screen with what was typed.
  if (loading || (!hasFullAccess && !!userId && fix === undefined)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (hasFullAccess) {
    return <>{children}</>;
  }

  if (fix) {
    return <CompanyProfileFixForm fix={fix} onSaved={onFixSaved} />;
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
