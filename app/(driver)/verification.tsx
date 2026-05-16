import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
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
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  storagePublicUrlBase,
  uploadMediaObject,
  verificationPhotoObjectPath,
  withCacheBust,
} from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import {
  fetchVerificationStatus,
  submitVerification,
  type VerificationStatus,
} from '../../lib/verification';

const STEP_KEYS = [
  { key: 'license' as const, titleKey: 'license', hintKey: 'licenseHint' },
  { key: 'id' as const, titleKey: 'id', hintKey: 'idHint' },
  { key: 'registration' as const, titleKey: 'registration', hintKey: 'registrationHint' },
] as const;

function isRemoteUrl(s: string | null): boolean {
  return !!s && (s.startsWith('http://') || s.startsWith('https://'));
}

export default function DriverVerificationScreen() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const [licensePhoto, setLicensePhoto] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [vehicleRegPhoto, setVehicleRegPhoto] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

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
    const row = data as {
      is_verified?: boolean | null;
      verification_status?: string | null;
      license_photo?: string | null;
      id_photo?: string | null;
      vehicle_registration_photo?: string | null;
      rejection_reason?: string | null;
    } | null;
    const st = (row?.verification_status ?? 'pending') as VerificationStatus;
    setVerificationStatus(st);
    setIsVerified(!!row?.is_verified);
    setRejectionReason(row?.rejection_reason?.trim() || null);
    const bust = (u: string | null | undefined) => {
      const trimmed = u?.trim() || null;
      return trimmed && isRemoteUrl(trimmed) ? withCacheBust(trimmed) ?? trimmed : trimmed;
    };
    setLicensePhoto(bust(row?.license_photo));
    setIdPhoto(bust(row?.id_photo));
    setVehicleRegPhoto(bust(row?.vehicle_registration_photo));
    setStep(0);
  }, [userId, authLoading]);

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

  async function pickForStep(index: number) {
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
      const uri = res.assets[0].uri;
      if (index === 0) setLicensePhoto(uri);
      else if (index === 1) setIdPhoto(uri);
      else setVehicleRegPhoto(uri);
    } finally {
      setPicking(false);
    }
  }

  async function onSubmit() {
    if (!userId) return;
    if (!licensePhoto || !idPhoto || !vehicleRegPhoto) {
      setSubmitError(t('verificationScreen.allPhotosRequired'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resolveUrl = async (uri: string | null, slot: 'license' | 'id' | 'registration') => {
        if (!uri) throw new Error(t('verificationScreen.photoMissing'));
        if (isRemoteUrl(uri)) return storagePublicUrlBase(uri.trim());
        const mime = 'image/jpeg';
        const path = verificationPhotoObjectPath(userId, slot);
        return uploadMediaObject(path, uri, { contentType: mime });
      };

      const [licenseUrl, idUrl, regUrl] = await Promise.all([
        resolveUrl(licensePhoto, 'license'),
        resolveUrl(idPhoto, 'id'),
        resolveUrl(vehicleRegPhoto, 'registration'),
      ]);

      const { error } = await submitVerification(userId, {
        license_photo: licenseUrl,
        id_photo: idUrl,
        vehicle_registration_photo: regUrl,
      });
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

  const approvedView = verificationStatus === 'approved' || (isVerified && verificationStatus !== 'rejected');
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
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl, paddingHorizontal: SPACING.lg }]}>
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

  const s = STEP_KEYS[step];
  const currentUri = step === 0 ? licensePhoto : step === 1 ? idPhoto : vehicleRegPhoto;

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
      <Text style={styles.screenSub}>{t('verificationScreen.screenSub')}</Text>

      {verificationStatus === 'rejected' && rejectionReason ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>{t('verificationScreen.rejectedTitle')}</Text>
          <Text style={styles.rejectBody}>{rejectionReason}</Text>
          <Text style={styles.rejectHint}>{t('verificationScreen.rejectedHint')}</Text>
        </View>
      ) : null}

      <View style={styles.stepDots}>
        {STEP_KEYS.map((item, i) => (
          <View key={item.key} style={[styles.dot, i === step && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.stepLabel}>
        {t('verificationScreen.step', { current: step + 1, total: STEP_KEYS.length })}
      </Text>
      <Text style={styles.title}>{t(`verificationScreen.${s.titleKey}`)}</Text>
      <Text style={styles.sub}>{t(`verificationScreen.${s.hintKey}`)}</Text>

      <Pressable
        onPress={() => void pickForStep(step)}
        disabled={picking || submitting}
        style={({ pressed }) => [styles.pickBtn, (pressed || picking) && styles.pickBtnPressed]}
      >
        {picking ? (
          <ActivityIndicator color="#0f0f0f" />
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
        {step < STEP_KEYS.length - 1 ? (
          <Pressable
            onPress={() => {
              if (!currentUri) {
                setSubmitError(t('verificationScreen.pickFirst'));
                return;
              }
              setSubmitError(null);
              setStep((x) => x + 1);
            }}
            style={styles.primary}
            disabled={submitting}
          >
            <Text style={styles.primaryText}>{t('verificationScreen.next')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void onSubmit()}
            disabled={submitting || !licensePhoto || !idPhoto || !vehicleRegPhoto}
            style={[styles.primary, submitting && styles.primaryDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#0f0f0f" />
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
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    paddingHorizontal: SPACING.lg,
  },
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
    color: COLORS.grayLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  bigEmoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
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
  badgeTextOk: {
    color: COLORS.success,
    fontWeight: '800',
    fontSize: 13,
  },
  badgePending: {
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  badgeTextPending: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: 13,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  sub: {
    color: COLORS.grayLight,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  muted: {
    color: COLORS.gray,
    fontSize: 16,
  },
  err: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  retry: {
    marginTop: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
  },
  retryText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  rejectBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  rejectTitle: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: SPACING.xs,
  },
  rejectBody: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  rejectHint: {
    color: COLORS.grayLight,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotOn: {
    backgroundColor: COLORS.gold,
    width: 22,
  },
  stepLabel: {
    color: COLORS.gray,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  pickBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  pickBtnPressed: {
    opacity: 0.9,
  },
  pickBtnText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  previewPlaceholder: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  previewPhText: {
    color: COLORS.gray,
    fontSize: 14,
  },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  secondaryText: {
    color: COLORS.grayLight,
    fontWeight: '700',
    fontSize: 15,
  },
  primary: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: {
    opacity: 0.55,
  },
  primaryText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 16,
  },
});
