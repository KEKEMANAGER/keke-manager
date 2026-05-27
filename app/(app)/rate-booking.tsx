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
  fetchRatingForBooking,
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

      const { data: existing, error: ratingErr } = await fetchRatingForBooking(bookingId, companyId);
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
    if (!bookingId || !driverId || !companyId) {
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
    setSubmitting(true);
    const { error: err } = await insertRating(
      bookingId,
      companyId,
      driverId,
      overall,
      comment.trim() || null,
    );
    setSubmitting(false);
    if (err) {
      if (isDuplicateBookingRatingError(err)) {
        const { data: existing } = await fetchRatingForBooking(bookingId, companyId);
        if (existing) {
          applyExistingRating(existing);
          return;
        }
        setError(getSupabaseErrorMessage(err));
        return;
      }
      setError(getSupabaseErrorMessage(err) || t('rateBookingScreen.errorSubmit'));
      return;
    }
    router.replace('/(app)/dashboard');
  }

  const screenError = loadError ?? error;
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
      <Text style={styles.title}>{t('rateBookingScreen.title')}</Text>
      <Text style={styles.sub}>
        {alreadyRated ? t('rateBookingScreen.alreadyRatedSub') : t('rateBookingScreen.subtitle')}
      </Text>

      {alreadyRated ? (
        <View style={styles.ratedBadge}>
          <Text style={styles.ratedBadgeText}>{t('rateBookingScreen.alreadyRated')}</Text>
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
        disabled={formDisabled && !alreadyRated}
        style={({ pressed }) => [
          styles.primary,
          (pressed || submitting) && styles.primaryPressed,
          formDisabled && !alreadyRated && styles.primaryDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text style={styles.primaryText}>
            {alreadyRated ? t('common.back') : t('rateBookingScreen.submit')}
          </Text>
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
  ratedBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: SPACING.lg,
  },
  ratedBadgeText: {
    color: COLORS.success,
    fontWeight: '800',
    fontSize: 14,
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
