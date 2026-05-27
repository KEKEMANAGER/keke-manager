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
  verificationPhotoObjectPathLegacy,
  withCacheBust,
} from '../../lib/mediaUpload';
import { supabase } from '../../lib/supabase';
import {
  allVerificationPhotosPresent,
  emptyVerificationPhotos,
  isSimpleDocUploaded,
  photoUrlForSimpleDoc,
  photosFromUserRow,
  simpleDocPrimarySlot,
  verificationSimpleDocsForHired,
  type VerificationPhotos,
  type VerificationSimpleDoc,
} from '../../lib/verificationDocs';
import {
  fetchVerificationStatus,
  saveSingleVerificationDocument,
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<VerificationSimpleDoc | null>(null);
  const [docsDirty, setDocsDirty] = useState(false);
  const [isHiredDriverUser, setIsHiredDriverUser] = useState(() => isHiredDriver(profile));

  const simpleDocs = useMemo(
    () => verificationSimpleDocsForHired(isHiredDriverUser),
    [isHiredDriverUser],
  );

  const photosComplete = allVerificationPhotosPresent(photos, isHiredDriverUser);
  const approvedView =
    verificationStatus === 'approved' || (isVerified && verificationStatus !== 'rejected');
  const submittedView = verificationStatus === 'submitted' && !approvedView;
  const canSubmit =
    photosComplete &&
    !submitting &&
    (verificationStatus === 'pending' ||
      verificationStatus === 'rejected' ||
      ((verificationStatus === 'submitted' || approvedView) && docsDirty));

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

    const hired = !!row?.is_hired_driver || isHiredDriver(profile);
    const loaded = photosFromUserRow(row);
    const busted = { ...loaded };
    for (const doc of verificationSimpleDocsForHired(hired)) {
      const slot = simpleDocPrimarySlot(doc);
      busted[slot] = bustUri(busted[slot]);
    }
    setPhotos(busted);
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
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  async function uploadDoc(doc: VerificationSimpleDoc) {
    if (!userId || uploadingDoc) return;
    setSubmitError(null);
    setUploadingDoc(doc);
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

      const localUri = res.assets[0]!.uri;
      const path = verificationPhotoObjectPathLegacy(userId, doc);
      const publicUrl = await uploadMediaObject(path, localUri, { contentType: 'image/jpeg' });
      const { error } = await saveSingleVerificationDocument(userId, doc, publicUrl);
      if (error) {
        setSubmitError(error.message);
        return;
      }
      setDocsDirty(true);
      await load();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'));
    } finally {
      setUploadingDoc(null);
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
      const uploaded: Partial<Record<string, string>> = {};
      for (const doc of simpleDocs) {
        const uri = photoUrlForSimpleDoc(photos, doc);
        if (!uri) throw new Error(t('verificationScreen.photoMissing'));
        uploaded[doc] = isRemoteUrl(uri) ? storagePublicUrlBase(uri.trim()) : uri;
      }

      const payload: Parameters<typeof submitVerification>[1] = {};
      for (const doc of simpleDocs) {
        const url = uploaded[doc]!;
        if (doc === 'id') {
          payload.id_front = url;
          payload.id_back = url;
        } else if (doc === 'license') {
          payload.license_front = url;
          payload.license_back = url;
        } else {
          payload.tech_passport_front = url;
          payload.tech_passport_back = url;
        }
      }

      const { error } = await submitVerification(userId, payload);
      if (error) {
        setSubmitError(error.message);
        return;
      }
      setDocsDirty(false);
      await load();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t('vehicleScreen.uploadFailed'));
    } finally {
      setSubmitting(false);
    }
  }

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

      {approvedView ? (
        <View style={styles.statusHero}>
          <Text style={styles.bigEmoji}>✅</Text>
          <View style={[styles.badge, styles.badgeOk]}>
            <Text style={styles.badgeTextOk}>{t('verificationScreen.verifiedBadge')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('verificationScreen.verifiedTitle')}</Text>
          <Text style={styles.heroSub}>{t('verificationScreen.verifiedSub')}</Text>
        </View>
      ) : submittedView ? (
        <View style={styles.statusHero}>
          <Text style={styles.bigEmoji}>⏳</Text>
          <View style={[styles.badge, styles.badgePending]}>
            <Text style={styles.badgeTextPending}>{t('verificationScreen.pendingBadge')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('verificationScreen.pendingTitle')}</Text>
          <Text style={styles.heroSub}>{t('verificationScreen.pendingSub')}</Text>
        </View>
      ) : verificationStatus === 'rejected' ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>{t('verificationScreen.rejectedTitle')}</Text>
          {rejectionReason ? <Text style={styles.rejectBody}>{rejectionReason}</Text> : null}
          <Text style={styles.rejectHint}>{t('verificationScreen.rejectedHint')}</Text>
        </View>
      ) : (
        <Text style={styles.screenSub}>
          {isHiredDriverUser
            ? t('verificationScreen.screenSubHiredSimple')
            : t('verificationScreen.screenSubFreelanceSimple')}
        </Text>
      )}

      {submittedView || approvedView || verificationStatus === 'rejected' ? (
        <Text style={styles.docsEditHint}>{t('verificationScreen.docsEditHint')}</Text>
      ) : null}

      <View style={styles.docList}>
        {simpleDocs.map((doc) => {
          const uploaded = isSimpleDocUploaded(photos, doc);
          const uri = photoUrlForSimpleDoc(photos, doc);
          const busy = uploadingDoc === doc;
          return (
            <View key={doc} style={styles.docCard}>
              <View style={styles.docCardHead}>
                <Text style={styles.docCardTitle}>{t(`verificationScreen.doc_${doc}`)}</Text>
                <View style={[styles.docStatus, uploaded ? styles.docStatusOk : styles.docStatusMissing]}>
                  <Text style={uploaded ? styles.docStatusTextOk : styles.docStatusTextMissing}>
                    {uploaded ? t('verificationScreen.docUploaded') : t('verificationScreen.docMissing')}
                  </Text>
                </View>
              </View>
              {uri ? (
                <Image source={{ uri }} style={styles.docPreview} resizeMode="cover" />
              ) : (
                <View style={styles.docPreviewPlaceholder}>
                  <Text style={styles.docPreviewPh}>{t('verificationScreen.noPhoto')}</Text>
                </View>
              )}
              <Pressable
                onPress={() => void uploadDoc(doc)}
                disabled={busy || submitting}
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
      </View>

      {canSubmit ? (
        <Pressable
          onPress={() => void onSubmit()}
          disabled={submitting || !photosComplete}
          style={[styles.submitBtn, SHADOWS.button, submitting && styles.submitBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <Text style={styles.submitBtnText}>
              {verificationStatus === 'rejected' ||
              verificationStatus === 'submitted' ||
              approvedView
                ? t('verificationScreen.resubmit')
                : t('verificationScreen.submit')}
            </Text>
          )}
        </Pressable>
      ) : null}

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
    marginBottom: SPACING.md,
  },
  screenSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  docsEditHint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: SPACING.md,
  },
  statusHero: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  bigEmoji: { fontSize: 48, marginBottom: SPACING.sm },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: SPACING.sm,
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
  heroTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  heroSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
  docList: { gap: SPACING.md, marginBottom: SPACING.lg },
  docCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  docCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  docCardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1 },
  docStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  docStatusOk: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  docStatusMissing: {
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  docStatusTextOk: { color: COLORS.success, fontSize: 11, fontWeight: '800' },
  docStatusTextMissing: { color: COLORS.goldDark, fontSize: 11, fontWeight: '800' },
  docPreview: {
    width: '100%',
    height: 140,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surfaceAlt,
    marginBottom: SPACING.sm,
  },
  docPreviewPlaceholder: {
    width: '100%',
    height: 140,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  docPreviewPh: { color: COLORS.textMuted, fontSize: 13 },
  uploadBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  uploadBtnPressed: { opacity: 0.9 },
  uploadBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 15 },
  submitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
});
