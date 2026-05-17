import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { isHiredDriver } from '../../lib/role';
import {
  storagePublicUrlBase,
  uploadMediaObject,
  verificationPhotoObjectPath,
  withCacheBust,
} from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import {
  allVerificationPhotosPresent,
  emptyVerificationPhotos,
  photosFromUserRow,
  verificationStepsForHired,
  type VerificationDocSlot,
  type VerificationPhotos,
} from '../../lib/verificationDocs';
import {
  fetchVerificationStatus,
  submitVerification,
  type VerificationStatus,
} from '../../lib/verification';

function isRemoteUrl(s: string | null): boolean {
  return !!s && (s.startsWith('http://') || s.startsWith('https://'));
}

function bustUri(u: string | null | undefined): string | null {
  const trimmed = u?.trim() || null;
  return trimmed && isRemoteUrl(trimmed) ? withCacheBust(trimmed) ?? trimmed : trimmed;
}

export default function DriverVerificationScreen() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [photos, setPhotos] = useState<VerificationPhotos>(emptyVerificationPhotos);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [isHiredDriverUser, setIsHiredDriverUser] = useState(() => isHiredDriver(profile));

  const steps = useMemo(
    () => verificationStepsForHired(isHiredDriverUser),
    [isHiredDriverUser],
  );

  const currentSlot = steps[step] ?? 'license_front';
  const currentUri = photos[currentSlot];
  const photosComplete = allVerificationPhotosPresent(photos, isHiredDriverUser);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      setVerificationStatus(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchVerificationStatus(userId);
    setLoading(false);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const row = data as Record<string, unknown> | null;
    setIsHiredDriverUser(!!row?.is_hired_driver || isHiredDriver(profile));
    const st = (row?.verification_status ?? 'pending') as VerificationStatus;
    setVerificationStatus(st);
    setIsVerified(!!row?.is_verified);
    setRejectionReason((row?.rejection_reason as string | null)?.trim() || null);

    const loaded = photosFromUserRow(row);
    const busted = { ...loaded };
    for (const slot of Object.keys(busted) as VerificationDocSlot[]) {
      busted[slot] = bustUri(busted[slot]);
    }
    setPhotos(busted);
    setStep(0);
  }, [userId, authLoading, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`verification-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            is_verified?: boolean | null;
            verification_status?: string | null;
            rejection_reason?: string | null;
          };
          setVerificationStatus((row.verification_status ?? 'pending') as VerificationStatus);
          setIsVerified(!!row.is_verified);
          setRejectionReason(row.rejection_reason?.trim() || null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  async function pickForSlot(slot: VerificationDocSlot) {
    if (!userId || picking) return;
    setPicking(true);
    setSubmitError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setSubmitError(t('profilePage.photoPermissionDenied'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (res.canceled || !res.assets[0]) return;
      setPhotos((prev) => ({ ...prev, [slot]: res.assets[0]!.uri }));
    } finally {
      setPicking(false);
    }
  }

  async function onSubmit() {
    if (!userId) return;
    if (!photosComplete) {
      setSubmitError(t('verificationScreen.allPhotosRequired'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const uploaded: Partial<Record<VerificationDocSlot, string>> = {};
      await Promise.all(
        steps.map(async (slot) => {
          const uri = photos[slot];
          if (!uri) throw new Error(t('verificationScreen.photoMissing'));
          if (isRemoteUrl(uri)) {
            uploaded[slot] = storagePublicUrlBase(uri.trim());
            return;
          }
          const path = verificationPhotoObjectPath(userId, slot);
          uploaded[slot] = await uploadMediaObject(path, uri, { contentType: 'image/jpeg' });
        }),
      );

      const { error } = await submitVerification(userId, uploaded);
      if (error) {
        setSubmitError(error.message);
        return;
      }
      await load();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const approvedView =
    verificationStatus === 'approved' || (isVerified && verificationStatus !== 'rejected');
  const submittedView = verificationStatus === 'submitted' && !approvedView;

  if (authLoading || loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <Text style={styles.muted}>{t('verificationScreen.signInRequired')}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View
        style={[styles.center, { paddingTop: insets.top + SPACING.xl, paddingHorizontal: SPACING.lg }]}
      >
        <Text style={styles.err}>{loadError}</Text>
        <Pressable onPress={() => void load()} style={styles.retry}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (approvedView) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
        ]}
      >
        <Text style={styles.bigEmoji}>✅</Text>
        <View style={[styles.badge, styles.badgeOk]}>
          <Text style={styles.badgeTextOk}>{t('verificationScreen.verifiedBadge')}</Text>
        </View>
        <Text style={styles.title}>{t('verificationScreen.verifiedTitle')}</Text>
        <Text style={styles.sub}>{t('verificationScreen.verifiedSub')}</Text>
      </ScrollView>
    );
  }

  if (submittedView) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
        ]}
      >
        <Text style={styles.bigEmoji}>⏳</Text>
        <View style={[styles.badge, styles.badgePending]}>
          <Text style={styles.badgeTextPending}>{t('verificationScreen.pendingBadge')}</Text>
        </View>
        <Text style={styles.title}>{t('verificationScreen.pendingTitle')}</Text>
        <Text style={styles.sub}>{t('verificationScreen.pendingSub')}</Text>
      </ScrollView>
    );
  }

  const groupKey = currentSlot.startsWith('license')
    ? 'license'
    : currentSlot.startsWith('tech')
      ? 'techPassport'
      : 'id';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.inner,
        { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>{t('verificationScreen.title')}</Text>
      <Text style={styles.screenSub}>
        {isHiredDriverUser
          ? t('verificationScreen.screenSubHired')
          : t('verificationScreen.screenSubFreelance')}
      </Text>

      {verificationStatus === 'rejected' && rejectionReason ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>{t('verificationScreen.rejectedTitle')}</Text>
          <Text style={styles.rejectBody}>{rejectionReason}</Text>
          <Text style={styles.rejectHint}>{t('verificationScreen.rejectedHint')}</Text>
        </View>
      ) : null}

      <View style={styles.stepDots}>
        {steps.map((slot, i) => (
          <View
            key={slot}
            style={[
              styles.dot,
              i === step && styles.dotOn,
              photos[slot] && i !== step && styles.dotDone,
            ]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>
        {t('verificationScreen.step', { current: step + 1, total: steps.length })}
      </Text>

      <View style={styles.docGroupBadge}>
        <Text style={styles.docGroupText}>{t(`verificationScreen.${groupKey}Group`)}</Text>
      </View>
      <Text style={styles.title}>{t(`verificationScreen.${currentSlot}`)}</Text>
      <Text style={styles.sub}>{t(`verificationScreen.${currentSlot}Hint`)}</Text>

      <Pressable
        onPress={() => void pickForSlot(currentSlot)}
        disabled={picking || submitting}
        style={({ pressed }) => [styles.pickBtn, SHADOWS.button, (pressed || picking) && styles.pickBtnPressed]}
      >
        {picking ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.pickBtnText}>
            {currentUri ? t('verificationScreen.replace') : t('verificationScreen.pickPhoto')}
          </Text>
        )}
      </Pressable>

      {currentUri ? (
        <Image source={{ uri: currentUri }} style={styles.preview} resizeMode="contain" />
      ) : (
        <View style={styles.previewPlaceholder}>
          <Text style={styles.previewPhText}>{t('verificationScreen.noPhoto')}</Text>
        </View>
      )}

      <View style={styles.navRow}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((x) => x - 1)} style={styles.secondary} disabled={submitting}>
            <Text style={styles.secondaryText}>{t('common.back')}</Text>
          </Pressable>
        ) : (
          <View style={styles.secondary} />
        )}
        {step < steps.length - 1 ? (
          <Pressable
            onPress={() => {
              if (!currentUri) {
                setSubmitError(t('verificationScreen.pickFirst'));
                return;
              }
              setSubmitError(null);
              setStep((x) => x + 1);
            }}
            style={[styles.primary, SHADOWS.button]}
            disabled={submitting}
          >
            <Text style={styles.primaryText}>{t('verificationScreen.next')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void onSubmit()}
            disabled={submitting || !photosComplete}
            style={[styles.primary, SHADOWS.button, submitting && styles.primaryDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <Text style={styles.primaryText}>{t('verificationScreen.submit')}</Text>
            )}
          </Pressable>
        )}
      </View>

      {submitError ? <Text style={styles.err}>{submitError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  inner: { paddingHorizontal: SPACING.lg },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  screenSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  bigEmoji: { fontSize: 56, textAlign: 'center', marginBottom: SPACING.md },
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: SPACING.md,
  },
  badgeOk: {
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  badgeTextOk: { color: COLORS.success, fontWeight: '800', fontSize: 13 },
  badgePending: {
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  badgeTextPending: { color: COLORS.goldDark, fontWeight: '800', fontSize: 13 },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  sub: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  muted: { color: COLORS.textMuted, fontSize: 16 },
  err: { color: COLORS.error, fontSize: 14, textAlign: 'center', marginTop: SPACING.md },
  retry: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.button,
  },
  retryText: { color: COLORS.gold, fontWeight: '700' },
  rejectBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  rejectTitle: { color: COLORS.error, fontWeight: '800', fontSize: 15, marginBottom: SPACING.xs },
  rejectBody: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  rejectHint: { color: COLORS.textMuted, fontSize: 13, marginTop: SPACING.sm },
  stepDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotOn: { backgroundColor: COLORS.gold, width: 20 },
  dotDone: { backgroundColor: COLORS.goldLight },
  stepLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  docGroupBadge: {
    alignSelf: 'center',
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: SPACING.sm,
  },
  docGroupText: { color: COLORS.goldDark, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  pickBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  pickBtnPressed: { opacity: 0.9 },
  pickBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: SPACING.lg,
  },
  previewPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  previewPhText: { color: COLORS.textMuted, fontSize: 14 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  secondary: {
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  secondaryText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 15 },
  primary: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});
