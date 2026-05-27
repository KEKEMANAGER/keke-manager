import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import { fetchBookingById, isBookingRowUuid } from '../../lib/bookings';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  fetchRatingByBookingAndRater,
  insertRating,
  isDuplicateBookingRatingError,
} from '../../lib/ratings';
import { trimUserId } from '../../lib/userId';
import { useAuth } from '../../contexts/AuthContext';

function pickSearchParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return typeof v === 'string' ? v.trim() : '';
}

export default function RateBookingScreen() {
  const { t } = useTranslation();
  const searchParams = useLocalSearchParams();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = searchParams as Record<string, string | string[] | undefined>;
  const bookingId = pickSearchParam(params.bookingId);
  const companyId = user?.id ?? '';

  const [driverId, setDriverId] = useState('');
  /** `bookings.company_id` — used when persisting rating (matches RLS + unique index). */
  const [ratingCompanyId, setRatingCompanyId] = useState('');
  const [bookingKindBadge, setBookingKindBadge] = useState<string | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** 1–5; persisted as `ratings.overall`. */
  const [overall, setOverall] = useState(0);
  const [comment, setComment] = useState('');
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBooking = useCallback(async () => {
    setLoadError(null);
    setDriverId('');
    setRatingCompanyId('');
    setBookingKindBadge(null);
    if (!bookingId || !companyId) {
      setLoadError(t('rateBookingScreen.errorLoad'));
      setLoadingBooking(false);
      return;
    }
    if (!isBookingRowUuid(bookingId)) {
      setLoadError(t('rateBookingScreen.errorLoad'));
      setLoadingBooking(false);
      return;
    }
    setLoadingBooking(true);
    try {
      const { data, error: fetchErr } = await fetchBookingById(bookingId, companyId);
      if (fetchErr || !data) {
        setLoadError(t('rateBookingScreen.errorLoad'));
        return;
      }
      if (data.status !== 'completed') {
        setLoadError(t('rateBookingScreen.errorLoad'));
        return;
      }
      const assignedDriverId = trimUserId(data.driver_id);
      if (!assignedDriverId) {
        setLoadError(t('rateBookingScreen.errorLoad'));
        return;
      }
      const driverIdFromUrl = trimUserId(pickSearchParam(params.driverId));
      if (driverIdFromUrl && driverIdFromUrl !== assignedDriverId) {
        setLoadError(t('rateBookingScreen.errorLoad'));
        return;
      }
      setDriverId(assignedDriverId);
      const ownerCompanyId = trimUserId(data.company_id) || companyId;
      setRatingCompanyId(ownerCompanyId);
      setBookingKindBadge(ratingKindBadgeLabel(data.kind, t));

      const { data: existing, error: ratingErr } = await fetchRatingByBookingAndRater(
        bookingId,
        companyId,
      );
      if (ratingErr) {
        setLoadError(ratingErr.message);
        return;
      }
      if (existing) {
        setAlreadyRated(true);
        setOverall(Number(existing.overall) || 0);
        setComment(existing.comment?.trim() ?? '');
      } else {
        setAlreadyRated(false);
        setOverall(0);
        setComment('');
      }
    } finally {
      setLoadingBooking(false);
    }
  }, [bookingId, companyId, params.driverId, t]);

  function applyExistingRating(existing: {
    overall: number;
    comment: string | null;
  }) {
    setAlreadyRated(true);
    setOverall(Number(existing.overall) || 0);
    setComment(existing.comment?.trim() ?? '');
    setError(null);
  }

  useEffect(() => {
    void loadBooking();
  }, [loadBooking]);

  useFocusEffect(
    useCallback(() => {
      if (bookingId && companyId) void loadBooking();
    }, [loadBooking, bookingId, companyId]),
  );

  function skip() {
    router.back();
  }

  async function submit() {
    setError(null);
    if (alreadyRated) {
      router.back();
      return;
    }
    if (loadError || loadingBooking) {
      return;
    }
    const persistCompanyId = ratingCompanyId || companyId;
    if (!bookingId || !driverId || !persistCompanyId) {
      setError(t('rateBookingScreen.errorLoad'));
      return;
    }
    if (!isBookingRowUuid(bookingId)) {
      setError(t('rateBookingScreen.errorLoad'));
      return;
    }
    if (overall < 1 || overall > 5) {
      setError(t('rateBookingScreen.starsHint'));
      return;
    }

    const { data: existingBeforeSubmit } = await fetchRatingByBookingAndRater(bookingId, companyId);
    if (existingBeforeSubmit) {
      applyExistingRating(existingBeforeSubmit);
      return;
    }

    setSubmitting(true);
    const { error: err } = await insertRating(
      bookingId,
      persistCompanyId,
      driverId,
      overall,
      comment.trim() || null,
    );
    setSubmitting(false);
    if (err) {
      if (isDuplicateBookingRatingError(err)) {
        const { data: existing } = await fetchRatingByBookingAndRater(bookingId, companyId);
        if (existing) {
          applyExistingRating(existing);
          return;
        }
        setAlreadyRated(true);
        setError(null);
        return;
      }
      setError(getSupabaseErrorMessage(err) || t('rateBookingScreen.errorSubmit'));
      return;
    }
    router.replace('/(app)/dashboard');
  }

  const screenError = alreadyRated ? null : loadError ?? error;
  const formDisabled = loadingBooking || !!loadError || submitting;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.inner,
        { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {bookingKindBadge ? (
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>{bookingKindBadge}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{t('rateBookingScreen.title')}</Text>
      <Text style={styles.sub}>
        {alreadyRated ? t('rateBookingScreen.alreadyRatedBooking') : t('rateBookingScreen.subtitle')}
      </Text>

      {alreadyRated ? (
        <View style={styles.alreadyRatedBox}>
          <Text style={styles.alreadyRatedMsg}>{t('rateBookingScreen.alreadyRatedBooking')}</Text>
        </View>
      ) : null}

      {loadingBooking ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setOverall(n)}
                style={styles.starHit}
                disabled={formDisabled || alreadyRated}
              >
                <Text style={[styles.star, n <= overall ? styles.starOn : styles.starOff]}>★</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('rateBookingScreen.comment')}</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('rateBookingScreen.comment')}
            placeholderTextColor={COLORS.gray}
            style={styles.input}
            multiline
            textAlignVertical="top"
            editable={!formDisabled && !alreadyRated}
          />
        </>
      )}

      {screenError ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{screenError}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={formDisabled || alreadyRated}
        style={({ pressed }) => [
          styles.primary,
          (pressed || submitting) && styles.primaryPressed,
          (formDisabled || alreadyRated) && styles.primaryDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text style={styles.primaryText}>{t('rateBookingScreen.submit')}</Text>
        )}
      </Pressable>

      {!alreadyRated ? (
        <Pressable onPress={skip} style={styles.skip} disabled={submitting}>
          <Text style={styles.skipText}>{t('rateBookingScreen.skip')}</Text>
        </Pressable>
      ) : null}
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
  loading: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  sub: {
    color: COLORS.grayLight,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  kindBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: SPACING.md,
  },
  kindBadgeText: {
    color: COLORS.goldDark,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  alreadyRatedBox: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.success,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  alreadyRatedMsg: {
    color: COLORS.success,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  starHit: {
    padding: SPACING.sm,
  },
  star: {
    fontSize: 40,
    lineHeight: 44,
  },
  starOn: {
    color: COLORS.gold,
  },
  starOff: {
    color: COLORS.border,
  },
  label: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  errBox: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244,67,54,0.12)',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errText: {
    color: COLORS.error,
    fontSize: 14,
  },
  primary: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  primaryPressed: {
    opacity: 0.9,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#0f0f0f',
    fontSize: 17,
    fontWeight: '800',
  },
  skip: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  skipText: {
    color: COLORS.gray,
    fontSize: 16,
    fontWeight: '600',
  },
});

function ratingKindBadgeLabel(
  kind: string | null | undefined,
  t: (key: string) => string,
): string | null {
  const k = (kind ?? '').trim();
  if (!k) return null;
  if (k === 'transfer' || k.startsWith('transfer_')) {
    return t('rateBookingScreen.badgeTransfer');
  }
  if (k === 'day_tour') {
    return t('rateBookingScreen.badgeOneDay');
  }
  if (k === 'tour') {
    return t('rateBookingScreen.badgeMultiDay');
  }
  return null;
}
