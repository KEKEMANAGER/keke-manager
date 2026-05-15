import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SPACING } from '../../constants/theme';
import type { BookingRow } from '../../lib/bookings';
import {
  aggregateDriverStats,
  fetchBookingsForDriver,
  fetchOpenPendingBookings,
  formatBookingDate,
  isNewOpenPendingBookingInsert,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { notifyNewOpenBooking } from '../../lib/localNotifications';
import { fetchDriverAverageRating } from '../../lib/ratings';
import { useAuth } from '../../contexts/AuthContext';

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

export default function DriverDashboardScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const firstName =
    profile?.full_name?.trim()?.split(/\s+/)[0] ??
    user?.email?.split('@')[0] ??
    'მძღოლი';
  const userId = user?.id;

  const pendingPulse = useRef(new Animated.Value(1)).current;
  const activeDotOpacity = useRef(new Animated.Value(1)).current;

  const [assigned, setAssigned] = useState<BookingRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState(0);

  const load = useCallback(async () => {
    if (!userId) {
      setAssigned([]);
      setOpenCount(0);
      setCompletedTrips(0);
      setEarnings(0);
      setRatingAvg(0);
      setRatingCount(0);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const [mine, open, stats, ratingRes] = await Promise.all([
      fetchBookingsForDriver(userId),
      fetchOpenPendingBookings(),
      aggregateDriverStats(userId),
      fetchDriverAverageRating(userId),
    ]);
    setLoading(false);
    if (mine.error) {
      setError(mine.error.message);
      setAssigned([]);
    } else {
      setAssigned(mine.data);
    }
    if (open.error) {
      setOpenCount(0);
    } else {
      setOpenCount(open.data.length);
    }
    if (stats.error) {
      setCompletedTrips(0);
      setEarnings(0);
    } else {
      setCompletedTrips(stats.completed);
      setEarnings(stats.earnings);
    }
    if (ratingRes.error) {
      setRatingAvg(0);
      setRatingCount(0);
    } else {
      setRatingAvg(ratingRes.average);
      setRatingCount(ratingRes.count);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((payload) => {
      void load();
      if (Platform.OS !== 'web' && isNewOpenPendingBookingInsert(payload)) {
        void notifyNewOpenBooking();
      }
    });
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  useEffect(() => {
    if (openCount <= 0) {
      pendingPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pendingPulse, {
          toValue: 0.3,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pendingPulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [openCount, pendingPulse]);

  const activeBooking =
    assigned
      .filter((b) => b.status === 'confirmed')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] ?? null;

  const hasActive = !!activeBooking;

  useEffect(() => {
    if (!hasActive) {
      activeDotOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activeDotOpacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(activeDotOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasActive, activeDotOpacity]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl + 72 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>გამარჯობა,</Text>
          <Text style={styles.name}>{firstName}</Text>
          <Text style={styles.ratingLine}>
            ⭐{' '}
            {ratingCount > 0 ? ratingAvg.toFixed(1) : '—'} ({ratingCount} შეფასება)
          </Text>
        </View>
        <View style={styles.balancePill}>
          <Text style={styles.balanceLabel}>მოგება</Text>
          <Text style={styles.balanceValue}>{formatGel(earnings)}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/(driver)/bookings')}
        style={({ pressed }) => [
          styles.pendingBanner,
          pressed && styles.pendingBannerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="ახალი შეკვეთები, გახსენით ჯავშნების სია"
      >
        <View style={styles.pendingLeft}>
          <Text style={styles.pendingLabel}>ახალი შეკვეთები (მოლოდინში)</Text>
          <Text style={styles.pendingSubtitle}>
            {openCount > 0 ? '• დააჭირე სანახავად' : 'ახალი შეკვეთა არ არის'}
          </Text>
        </View>
        {openCount > 0 ? (
          <Animated.Text style={[styles.pendingValue, { opacity: pendingPulse }]}>
            {openCount}
          </Animated.Text>
        ) : (
          <Text style={styles.pendingValue}>{openCount}</Text>
        )}
        <Text style={styles.pendingArrow}>→</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>ხელახლა</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>აქტიური ჯავშანი</Text>
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : hasActive && activeBooking ? (
        <View style={[styles.activeCard, SHADOWS.gold]}>
          <View style={styles.activeBadge}>
            <Animated.View style={[styles.activeBadgeDot, { opacity: activeDotOpacity }]} />
            <Text style={styles.activeBadgeText}>დადასტურებული</Text>
          </View>
          <Text style={styles.company}>{activeBooking.company_name || 'კომპანია'}</Text>
          <Text style={styles.route}>{routeSummary(activeBooking)}</Text>
          <View style={styles.activeMeta}>
            <Text style={styles.meta}>{formatBookingDate(activeBooking)}</Text>
            <Text style={styles.price}>{formatGel(Number(activeBooking.price_gel))}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyActive}>
          <Text style={styles.emptyActiveEmoji}>🚗</Text>
          <Text style={styles.emptyActiveText}>აქტიური ჯავშანი არ არის</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>სტატისტიკა</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={styles.statIconPill}>
            <Text style={styles.statIconEmoji}>🚗</Text>
          </View>
          <Text style={styles.statValue}>{completedTrips}</Text>
          <Text style={styles.statLabel}>დასრულებული რეისი</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconPill}>
            <Text style={styles.statIconEmoji}>💰</Text>
          </View>
          <Text style={styles.statValue}>{formatGel(earnings)}</Text>
          <Text style={styles.statLabel}>მოგება (დასრულებული)</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  headerText: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  greeting: {
    color: COLORS.grayLight,
    fontSize: 15,
  },
  name: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  ratingLine: {
    color: COLORS.grayLight,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  balancePill: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'flex-end',
  },
  balanceLabel: {
    color: COLORS.gray,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    color: COLORS.goldLight,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(26, 26, 46, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  pendingBannerPressed: {
    opacity: 0.88,
    borderColor: COLORS.gold,
  },
  pendingLeft: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  pendingLabel: {
    color: COLORS.grayLight,
    fontSize: 14,
    fontWeight: '600',
  },
  pendingSubtitle: {
    color: COLORS.gray,
    fontSize: 12,
    marginTop: 4,
  },
  pendingValue: {
    color: COLORS.gold,
    fontSize: 22,
    fontWeight: '800',
    marginRight: SPACING.sm,
  },
  pendingArrow: {
    color: COLORS.goldLight,
    fontSize: 22,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: 'rgba(244,67,54,0.12)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    marginBottom: SPACING.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  retryText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  activeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.gold,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  activeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  activeBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gold,
  },
  activeBadgeText: {
    color: COLORS.goldLight,
    fontSize: 12,
    fontWeight: '700',
  },
  company: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  route: {
    color: COLORS.grayLight,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  activeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: COLORS.gray,
    fontSize: 14,
  },
  price: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyActive: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: 32,
    marginBottom: SPACING.xl,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  emptyActiveEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyActiveText: {
    color: COLORS.gray,
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    minHeight: 120,
    justifyContent: 'flex-start',
  },
  statIconPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  statIconEmoji: {
    fontSize: 18,
  },
  statValue: {
    color: COLORS.goldLight,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  statLabel: {
    color: COLORS.gray,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
});
