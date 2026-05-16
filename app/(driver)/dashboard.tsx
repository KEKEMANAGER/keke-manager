import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../../components/AppLogo';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { BookingRealtimeRecord, BookingRow } from '../../lib/bookings';
import {
  aggregateDriverStats,
  bookingStatusLabel,
  fetchBookingsForDriver,
  fetchOpenPendingBookingsForDriver,
  formatBookingDate,
  isNewOpenPendingBookingInsert,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { notifyNewOpenBookingIfMatchesDriver } from '../../lib/localNotifications';
import { sendExpoPushNotification } from '../../lib/expoPush';
import { getTestNotificationContent } from '../../lib/notifications';
import { registerForPushNotificationsAsync } from '../../lib/pushRegistration';
import { fetchDriverAverageRating } from '../../lib/ratings';
import { useAuth } from '../../contexts/AuthContext';

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function StatIcon({
  name,
  backgroundColor,
  iconColor,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  backgroundColor: string;
  iconColor: string;
}) {
  return (
    <View style={[styles.statIconCircle, { backgroundColor }]}>
      <Ionicons name={name} size={20} color={iconColor} />
    </View>
  );
}

export default function DriverDashboardScreen() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const firstName =
    profile?.full_name?.trim()?.split(/\s+/)[0] ??
    user?.email?.split('@')[0] ??
    t('driver.defaultName');
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
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [testPushSending, setTestPushSending] = useState(false);

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
    const results = await Promise.all([
      fetchBookingsForDriver(userId),
      fetchOpenPendingBookingsForDriver(userId),
      aggregateDriverStats(userId),
      fetchDriverAverageRating(userId),
    ]);
    const mine = results[0]!;
    const open = results[1]!;
    const stats = results[2]!;
    const ratingRes = results[3]!;
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
    if (Platform.OS === 'web' || !userId) return;
    void registerForPushNotificationsAsync(userId).then(setPushToken);
  }, [userId]);

  const handleSendTestPush = useCallback(async () => {
    if (!userId) return;
    setTestPushSending(true);
    let token = pushToken;
    if (!token) {
      token = await registerForPushNotificationsAsync(userId);
      setPushToken(token);
    }
    setTestPushSending(false);
    if (!token) {
      Alert.alert(t('notifications.testTitle'), t('notifications.noToken'));
      return;
    }
    const { title, body } = getTestNotificationContent();
    const result = await sendExpoPushNotification(token, title, body, { type: 'test' });
    Alert.alert(
      t('notifications.testTitle'),
      result.ok ? t('notifications.testSent') : `${t('notifications.testFailed')}: ${result.error}`,
    );
  }, [userId, pushToken, t]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((payload) => {
      void load();
      if (Platform.OS !== 'web' && isNewOpenPendingBookingInsert(payload) && userId) {
        const row = payload.new as BookingRealtimeRecord | undefined;
        void notifyNewOpenBookingIfMatchesDriver(
          userId,
          row?.vehicle_type ?? '',
          row?.vehicle_class ?? '',
          row?.kind ?? row?.booking_type,
        );
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
      .filter((b) => b.status === 'accepted' || b.status === 'in_progress')
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
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <AppLogo size="header" />
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{t('driver.greeting')}</Text>
          <Text style={styles.name}>{firstName}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={COLORS.gold} />
            <Text style={styles.ratingLine}>
              {ratingCount > 0 ? ratingAvg.toFixed(1) : '—'} ({ratingCount} {t('driver.ratingCount')})
            </Text>
          </View>
        </View>
        <View style={styles.balancePill}>
          <View style={styles.balanceGradient} />
          <Text style={styles.balanceLabel}>{t('driver.earnings')}</Text>
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
        accessibilityLabel={t('driver.a11yNewOrders')}
      >
        <View style={styles.pendingLeft}>
          <Text style={styles.pendingLabel}>{t('driver.newOrdersPending')}</Text>
          <Text style={styles.pendingSubtitle}>
            {openCount > 0 ? t('driver.tapToView') : t('driver.noNewOrders')}
          </Text>
        </View>
        {openCount > 0 ? (
          <Animated.Text style={[styles.pendingValue, { opacity: pendingPulse }]}>
            {openCount}
          </Animated.Text>
        ) : (
          <Text style={styles.pendingValue}>{openCount}</Text>
        )}
        <Ionicons name="chevron-forward" size={22} color={COLORS.gold} />
      </Pressable>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionDivider} />
      <Text style={styles.sectionTitle}>{t('driver.activeBooking')}</Text>
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : hasActive && activeBooking ? (
        <View style={[styles.activeCard, SHADOWS.card]}>
          <View style={styles.activeBadge}>
            <Animated.View style={[styles.activeBadgeDot, { opacity: activeDotOpacity }]} />
            <Text style={styles.activeBadgeText}>
              {activeBooking ? bookingStatusLabel(activeBooking.status) : t('driver.confirmed')}
            </Text>
          </View>
          <Text style={styles.company}>{activeBooking.company_name || t('common.company')}</Text>
          <Text style={styles.route}>{routeSummary(activeBooking)}</Text>
          <View style={styles.activeMeta}>
            <Text style={styles.meta}>{formatBookingDate(activeBooking)}</Text>
            <Text style={styles.price}>{formatGel(Number(activeBooking.price_gel))}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyActive}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="car-outline" size={28} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyActiveText}>{t('driver.noActiveBooking')}</Text>
        </View>
      )}

      {__DEV__ && Platform.OS !== 'web' ? (
        <Pressable
          onPress={() => void handleSendTestPush()}
          disabled={testPushSending}
          style={({ pressed }) => [styles.devTestBtn, pressed && styles.devTestBtnPressed]}
        >
          {testPushSending ? (
            <ActivityIndicator color={COLORS.gold} size="small" />
          ) : (
            <Text style={styles.devTestBtnText}>{t('notifications.sendTest')}</Text>
          )}
        </Pressable>
      ) : null}

      <View style={styles.sectionDivider} />
      <Text style={styles.sectionTitle}>{t('driver.stats')}</Text>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardTrips]}>
          <StatIcon name="car-outline" backgroundColor={COLORS.blueTint} iconColor={COLORS.blue} />
          <Text style={styles.statValue}>{completedTrips}</Text>
          <Text style={styles.statLabel}>{t('driver.completedTrips')}</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRevenue]}>
          <StatIcon name="wallet-outline" backgroundColor="#FEF3C7" iconColor={COLORS.goldDark} />
          <Text style={styles.statValue}>{formatGel(earnings)}</Text>
          <Text style={styles.statLabel}>{t('driver.earningsCompleted')}</Text>
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
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  name: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  ratingLine: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  balancePill: {
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.goldLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'flex-end',
    overflow: 'hidden',
    minWidth: 108,
    ...SHADOWS.card,
  },
  balanceGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF4DC',
  },
  balanceLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    color: COLORS.goldDark,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
    ...SHADOWS.card,
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
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pendingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  pendingValue: {
    color: COLORS.goldDark,
    fontSize: 32,
    fontWeight: '800',
    marginRight: SPACING.sm,
    minWidth: 28,
    textAlign: 'right',
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
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.surfaceAlt,
    marginVertical: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  activeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  activeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
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
    color: COLORS.goldDark,
    fontSize: 12,
    fontWeight: '700',
  },
  company: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  route: {
    color: COLORS.textSecondary,
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
    color: COLORS.textMuted,
    fontSize: 14,
  },
  price: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyActive: {
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: 32,
    marginBottom: SPACING.md,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyActiveText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  devTestBtn: {
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  devTestBtnPressed: {
    opacity: 0.85,
  },
  devTestBtnText: {
    color: COLORS.goldDark,
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    minHeight: 130,
    justifyContent: 'flex-start',
    ...SHADOWS.cardStrong,
  },
  statCardTrips: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.blue,
  },
  statCardRevenue: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
