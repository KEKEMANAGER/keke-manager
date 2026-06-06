import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppLayoutInsets } from '../../contexts/AppMenuContext';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../../components/AppLogo';
import { BookingListSkeleton } from '../../components/BookingListSkeleton';
import { ListEmptyState } from '../../components/ListEmptyState';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { BookingRealtimeRecord, BookingRow } from '../../lib/bookings';
import { isBookingPaymentPaid } from '../../lib/bookingPayments';
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
import { DriverAvailabilityPanel } from '../../components/DriverAvailabilityPanel';
import { FleetInvitePanel } from '../../components/FleetInvitePanel';
import { HostMyDriverPanel } from '../../components/HostMyDriverPanel';
import {
  fetchAcceptedFleetMembersForHost,
  fetchFleetContext,
  fetchPendingFleetInvitesForSub,
  type FleetContext,
  type FleetInviteView,
  type FleetMemberView,
} from '../../lib/fleet';
import { withCacheBust } from '../../lib/mediaUpload';
import { isHiredDriver } from '../../lib/role';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
} from '../../lib/vehicleCatalog';
import type { VehicleRow } from '../../lib/vehicles';
import { useAuth } from '../../contexts/AuthContext';
import { fetchActiveAds, type AdCard } from '../../lib/ads';
import { PartnersAdsSection } from '../../components/PartnersAdsSection';
import { HiredDriverActivePanel } from '../../components/HiredDriverActivePanel';
import { supabase } from '../../lib/supabase';

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
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const layout = useAppLayoutInsets();
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingAvg, setRatingAvg] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [testPushSending, setTestPushSending] = useState(false);
  const [fleetContext, setFleetContext] = useState<FleetContext>({ kind: 'none' });
  const [fleetInvites, setFleetInvites] = useState<FleetInviteView[]>([]);
  const [fleetInvitesError, setFleetInvitesError] = useState<string | null>(null);
  const [acceptedFleetMembers, setAcceptedFleetMembers] = useState<FleetMemberView[]>([]);
  const [ads, setAds] = useState<AdCard[]>([]);

  const isHired = isHiredDriver(profile);
  const isFleetSub = fleetContext.kind === 'sub';
  const hideOpenPool = isHired || isFleetSub;
  const assignedVehicle: VehicleRow | null =
    fleetContext.kind === 'sub' ? fleetContext.vehicle : null;

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!userId) {
      setAssigned([]);
      setOpenCount(0);
      setCompletedTrips(0);
      setEarnings(0);
      setRatingAvg(0);
      setRatingCount(0);
      setAds([]);
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      return;
    }
    setError(null);
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const fleetCtx = await fetchFleetContext(userId);
    setFleetContext(fleetCtx);
    const isSub = fleetCtx.kind === 'sub';
    const skipOpenPool = isHiredDriver(profile) || isSub;

    const results = await Promise.all([
      fetchBookingsForDriver(userId),
      skipOpenPool
        ? Promise.resolve({ data: [] as BookingRow[], error: null, hint: undefined })
        : fetchOpenPendingBookingsForDriver(userId),
      aggregateDriverStats(userId),
      fetchDriverAverageRating(userId),
      fetchActiveAds(),
      fetchPendingFleetInvitesForSub(userId),
      fetchAcceptedFleetMembersForHost(userId),
    ]);
    const mine = results[0]!;
    const open = results[1]!;
    const stats = results[2]!;
    const ratingRes = results[3]!;
    setAds(results[4]!);
    const invitesRes = results[5]!;
    if (invitesRes.error) {
      setFleetInvitesError(invitesRes.error.message);
      setFleetInvites([]);
      if (__DEV__) console.warn('[dashboard] fleet invites', invitesRes.error.message);
    } else {
      setFleetInvitesError(null);
      setFleetInvites(invitesRes.data ?? []);
    }
    const fleetMembersRes = results[6]!;
    if (!fleetMembersRes.error) {
      setAcceptedFleetMembers(fleetMembersRes.data);
    }
    if (mode === 'initial') setLoading(false);
    if (mode === 'refresh') setRefreshing(false);
    if (mine.error) {
      setError(getSupabaseErrorMessage(mine.error));
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
  }, [userId, profile?.is_hired_driver]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (userId) void load('silent');
    }, [userId, load]),
  );

  useEffect(() => {
    if (!userId) return;
    const chSub = supabase
      .channel(`driver-fleet-invites-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_fleet',
          filter: `sub_driver_id=eq.${userId}`,
        },
        () => {
          void load('silent');
        },
      )
      .subscribe();
    const chHost = supabase
      .channel(`driver-fleet-host-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_fleet',
          filter: `host_driver_id=eq.${userId}`,
        },
        () => {
          void load('silent');
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(chSub);
      void supabase.removeChannel(chHost);
    };
  }, [userId, load]);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    void registerForPushNotificationsAsync(userId).then(setPushToken);
  }, [userId]);

  const handleSendTestPush = useCallback(async () => {
    if (!userId) return;
    setTestPushSending(true);
    let token = pushToken;
    if (!token) {
      token = await registerForPushNotificationsAsync(userId, { requestPermission: true });
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
      void load('silent');
      if (
        Platform.OS !== 'web' &&
        isNewOpenPendingBookingInsert(payload) &&
        userId &&
        !hideOpenPool
      ) {
        const row = payload.new as BookingRealtimeRecord | undefined;
        void notifyNewOpenBookingIfMatchesDriver(
          userId,
          row?.vehicle_type ?? '',
          row?.vehicle_class ?? '',
          row?.kind ?? row?.booking_type,
          row?.driver_id,
        );
      }
    });
    return () => unsubscribeChannel(ch);
  }, [userId, load, hideOpenPool]);

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

  const activeStatuses = hideOpenPool
    ? (['pending', 'accepted', 'confirmed', 'in_progress'] as const)
    : (['accepted', 'confirmed', 'in_progress'] as const);

  const activeBooking =
    assigned
      .filter((b) => (activeStatuses as readonly string[]).includes(b.status))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] ?? null;

  const completedUnpaidBooking = hideOpenPool
    ? (assigned
        .filter((b) => b.status === 'completed' && !isBookingPaymentPaid(b))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] ??
      null)
    : null;

  const hiredPanelBooking = hideOpenPool ? (activeBooking ?? completedUnpaidBooking) : activeBooking;

  const hasActive = !!hiredPanelBooking;

  const vehiclePhotoUri = assignedVehicle?.photo_front
    ? withCacheBust(assignedVehicle.photo_front) ?? assignedVehicle.photo_front
    : null;

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
        { paddingTop: SPACING.md, paddingBottom: layout.paddingBottom },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={COLORS.gold}
          colors={[COLORS.gold]}
        />
      }
    >
      <View style={styles.headerRow}>
        <AppLogo size="header" />
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{t('driver.greeting')}</Text>
          <NameWithVerifiedBadge
            name={firstName}
            verified={profile?.is_verified}
            textStyle={styles.name}
          />
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

      {!isHired && !isFleetSub ? (
        <DriverAvailabilityPanel
          userId={userId}
          isAvailable={profile?.is_available === true}
          currentCity={profile?.current_city ?? profile?.city ?? null}
          onUpdated={() => refreshProfile()}
        />
      ) : null}

      {fleetInvitesError ? (
        <View style={styles.inviteErrorBanner}>
          <Ionicons name="warning-outline" size={18} color={COLORS.error} />
          <Text style={styles.inviteErrorText}>{fleetInvitesError}</Text>
        </View>
      ) : null}

      {fleetInvites.length > 0 && userId ? (
        <FleetInvitePanel
          invites={fleetInvites}
          subDriverId={userId}
          variant="banner"
          onUpdated={() => void load('silent')}
        />
      ) : null}

      <PartnersAdsSection ads={ads} />

      {hideOpenPool ? (
        <View style={styles.assignedVehicleCard}>
          <Text style={styles.assignedVehicleTitle}>{t('fleet.assignedVehicleTitle')}</Text>
          {fleetContext.kind === 'sub' ? (
            <Text style={styles.fleetBannerSub}>
              {t('fleet.subDashboardSub', {
                host: fleetContext.hostName ?? t('common.driver'),
              })}
            </Text>
          ) : null}
          {assignedVehicle ? (
            <View style={styles.assignedVehicleBody}>
              {vehiclePhotoUri ? (
                <Image source={{ uri: vehiclePhotoUri }} style={styles.assignedVehiclePhoto} />
              ) : (
                <View style={styles.assignedVehiclePhotoPh}>
                  <Ionicons name="car-outline" size={32} color={COLORS.textMuted} />
                </View>
              )}
              <View style={styles.assignedVehicleMeta}>
                <Text style={styles.assignedVehicleModel}>
                  {assignedVehicle.model?.trim() ||
                    (assignedVehicle.type ? vehicleTypeLabel(assignedVehicle.type) : '—')}
                </Text>
                {assignedVehicle.type ? (
                  <Text style={styles.assignedVehicleDetail}>
                    {vehicleTypeLabel(assignedVehicle.type)}
                  </Text>
                ) : null}
                {assignedVehicle.class ? (
                  <Text style={styles.assignedVehicleDetail}>
                    {vehicleClassLabel(assignedVehicle.class)}
                  </Text>
                ) : null}
                {assignedVehicle.plate?.trim() ? (
                  <Text style={styles.assignedVehiclePlate}>{assignedVehicle.plate.trim()}</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <Text style={styles.noAssignedVehicle}>{t('fleet.noAssignedVehicle')}</Text>
          )}
        </View>
      ) : null}

      {acceptedFleetMembers.length > 0 ? (
        <HostMyDriverPanel
          members={acceptedFleetMembers}
          onOpenFleet={() => router.push('/(driver)/fleet')}
        />
      ) : fleetContext.kind === 'host' ? (
        <Pressable
          onPress={() => router.push('/(driver)/find-drivers')}
          style={({ pressed }) => [styles.fleetHostLink, pressed && styles.pressed]}
        >
          <Ionicons name="person-add-outline" size={18} color={COLORS.gold} />
          <Text style={styles.fleetHostLinkText}>{t('fleet.inviteDriverHint')}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.gold} />
        </Pressable>
      ) : null}

      {!hideOpenPool ? (
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
            {openCount > 0 ? t('driver.tapToView') : t('dashboard.noNewOrders')}
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
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionDivider} />
      <Text style={styles.sectionTitle}>
        {hideOpenPool ? t('hiredDriver.assignedTripTitle') : t('driver.activeBooking')}
      </Text>
      {loading ? (
        <BookingListSkeleton variant="driver" />
      ) : hideOpenPool && userId ? (
        <HiredDriverActivePanel
          booking={hiredPanelBooking}
          driverUserId={userId}
          onTripUpdated={() => void load('silent')}
        />
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
        <ListEmptyState icon="car-outline" message={t('dashboard.noActiveBooking')} />
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
  inviteErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  inviteErrorText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
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
  fleetBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  fleetBannerTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  fleetBannerSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  fleetVehicleLine: {
    color: COLORS.goldDark,
    fontSize: 13,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  fleetHostLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  fleetHostLinkText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  assignedVehicleCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  assignedVehicleTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  assignedVehicleBody: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  assignedVehiclePhoto: {
    width: 96,
    height: 72,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  assignedVehiclePhotoPh: {
    width: 96,
    height: 72,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignedVehicleMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  assignedVehicleModel: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  assignedVehicleDetail: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  assignedVehiclePlate: {
    color: COLORS.goldDark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: SPACING.xs,
    letterSpacing: 0.5,
  },
  noAssignedVehicle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  bookingRow: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  bookingRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  bookingRowCompany: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: SPACING.sm,
  },
  bookingRowStatus: {
    color: COLORS.goldDark,
    fontSize: 12,
    fontWeight: '700',
  },
  bookingRowRoute: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  bookingRowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingRowPrice: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: { opacity: 0.9 },
});
