import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { isBookingRowUuid } from '../../lib/bookings';
import { insertRating } from '../../lib/ratings';
import { useAuth } from '../../contexts/AuthContext';

function pickSearchParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return typeof v === 'string' ? v.trim() : '';
}

/** Clerk user ids commonly look like `user_...`; used only as extra swap hint. */
function looksLikeClerkUserId(value: string): boolean {
  return /^user_[a-zA-Z0-9]+$/.test(value.trim());
}

/**
 * Ensures `bookingId` is the booking row UUID and `driverClerkId` is the driver's Clerk id.
 * Some Expo Router / web builds deliver the two search params reversed.
 */
function normalizeRatingRouteParams(
  bookingIdRaw: string,
  driverClerkIdRaw: string,
): { bookingId: string; driverClerkId: string } {
  const p = bookingIdRaw.trim();
  const q = driverClerkIdRaw.trim();
  const pUuid = isBookingRowUuid(p);
  const qUuid = isBookingRowUuid(q);
  if (pUuid && !qUuid) return { bookingId: p, driverClerkId: q };
  if (!pUuid && qUuid) return { bookingId: q, driverClerkId: p };
  if (looksLikeClerkUserId(p) && qUuid) return { bookingId: q, driverClerkId: p };
  if (looksLikeClerkUserId(q) && pUuid) return { bookingId: p, driverClerkId: q };
  return { bookingId: p, driverClerkId: q };
}

export default function RateBookingScreen() {
  const { t } = useTranslation();
  const searchParams = useLocalSearchParams();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = searchParams as {
    bookingId?: string | string[];
    driverClerkId?: string | string[];
  };
  const { bookingId, driverClerkId } = normalizeRatingRouteParams(
    pickSearchParam(params.bookingId),
    pickSearchParam(params.driverClerkId),
  );
  const companyId = user?.id ?? '';

  /** 1–5; persisted as `ratings.overall`. */
  const [overall, setOverall] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function skip() {
    router.back();
  }

  async function submit() {
    setError(null);
    if (!bookingId || !driverClerkId || !companyId) {
      setError(t('rateBookingScreen.errorLoad'));
      return;
    }
    if (!isBookingRowUuid(bookingId) || !driverClerkId || isBookingRowUuid(driverClerkId)) {
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
      driverClerkId,
      overall,
      comment.trim() || null,
    );
    setSubmitting(false);
    if (err) {
      setError(err.message || t('rateBookingScreen.errorSubmit'));
      return;
    }
    router.replace('/(app)/dashboard');
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
      <Text style={styles.title}>{t('rateBookingScreen.title')}</Text>
      <Text style={styles.sub}>{t('rateBookingScreen.subtitle')}</Text>

      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setOverall(n)} style={styles.starHit}>
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
      />

      {error ? (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={submitting}
        style={({ pressed }) => [
          styles.primary,
          (pressed || submitting) && styles.primaryPressed,
          submitting && styles.primaryDisabled,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text style={styles.primaryText}>{t('rateBookingScreen.submit')}</Text>
        )}
      </Pressable>

      <Pressable onPress={skip} style={styles.skip} disabled={submitting}>
        <Text style={styles.skipText}>{t('rateBookingScreen.skip')}</Text>
      </Pressable>
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
    marginBottom: SPACING.xl,
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
