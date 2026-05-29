import { Ionicons } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow, BookingStatus } from '../../lib/bookings';
import {
  aggregateCompanyStats,
  bookingStatusLabel,
  bookingTypeLabel,
  cancelBookingByCompany,
  fetchBookingsByCompanyId,
  formatBookingDate,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { BookingChatThreads } from '../../components/BookingChatThreads';
import { DriverProfileCard } from '../../components/DriverProfileCard';
import { UserAvatar } from '../../components/UserAvatar';
import { BookingListSkeleton } from '../../components/BookingListSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { supabase } from '../../lib/supabase';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { DriverProfile } from '../../lib/drivers';
import { fetchDriverProfile } from '../../lib/drivers';
import { vehicleClassLabel, vehicleTypeLabel } from '../../lib/vehicleCatalog';
import { fetchActiveAds, type AdCard } from '../../lib/ads';
import { PartnersAdsSection } from '../../components/PartnersAdsSection';
import {
  CompanyBookingVoucherModal,
  openCompanyVoucher,
} from '../../components/CompanyBookingVoucher';
import {
  fetchRatedBookingIdsForCompany,
  isBookingAlreadyRated,
} from '../../lib/ratings';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import { useAppLayoutInsets } from '../../contexts/AppMenuContext';

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function companyDisplayName(
  profile: Profile | null,
  user: User | null,
  fallbackCompany: string,
) {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? fallbackCompany;
}

function statusStyle(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return styles.badgePending;
    case 'accepted':
      return styles.badgeAccepted;
    case 'in_progress':
      return styles.badgeInProgress;
    case 'completed':
      return styles.badgeCompleted;
    case 'cancelled':
    case 'rejected':
      return styles.badgeBad;
    default:
      return styles.badgeMuted;
  }
}

function bookingCardStatusBorder(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return { borderLeftWidth: 3, borderLeftColor: '#9CA3AF' as const };
    case 'accepted':
      return { borderLeftWidth: 3, borderLeftColor: '#3B82F6' as const };
    case 'in_progress':
      return { borderLeftWidth: 3, borderLeftColor: '#F5A623' as const };
    case 'completed':
      return { borderLeftWidth: 3, borderLeftColor: '#10B981' as const };
    case 'rejected':
    case 'cancelled':
      return { borderLeftWidth: 3, borderLeftColor: '#E24B4A' as const };
    default:
      return { borderLeftWidth: 3, borderLeftColor: COLORS.border };
  }
}

function statusLabelColor(status: BookingStatus): { color: string } {
  switch (status) {
    case 'pending':
      return { color: COLORS.textSecondary };
    case 'accepted':
      return { color: '#1D4ED8' };
    case 'in_progress':
      return { color: COLORS.goldDark };
    case 'completed':
      return { color: '#047857' };
    case 'cancelled':
    case 'rejected':
      return { color: '#B91C1C' };
    default:
      return { color: COLORS.text };
  }
}

export default function CompanyDashboardScreen() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const layout = useAppLayoutInsets();
  const name = companyDisplayName(profile, user, t('common.company'));
  const userId = user?.id;

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [spent, setSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverModal, setDriverModal] = useState<BookingRow | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [ads, setAds] = useState<AdCard[]>([]);
  const [voucherBooking, setVoucherBooking] = useState<BookingRow | null>(null);
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!userId) {
      setBookings([]);
      setAds([]);
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      return;
    }
    setError(null);
    if (mode === 'initial') {
      setLoading(true);
    } else if (mode === 'refresh') {
      setRefreshing(true);
    }

    const [bRes, sRes, activeAds] = await Promise.all([
      fetchBookingsByCompanyId(userId),
      aggregateCompanyStats(userId),
      fetchActiveAds(),
    ]);
    setAds(activeAds);

    const completedBookingIds = (bRes.data ?? [])
      .filter((b) => b.status === 'completed' && b.driver_id)
      .map((b) => b.id);
    const ratedRes = await fetchRatedBookingIdsForCompany(userId, completedBookingIds);
    setRatedBookingIds(ratedRes.ids);

    if (mode === 'initial') {
      setLoading(false);
    } else if (mode === 'refresh') {
      setRefreshing(false);
    }

    if (bRes.error) {
      setError(getSupabaseErrorMessage(bRes.error));
      setBookings([]);
    } else {
      setBookings(bRes.data);
    }
    if (sRes.error) {
      setTotalCount(0);
      setSpent(0);
    } else {
      setTotalCount(sRes.total);
      setSpent(sRes.spent);
    }
  }, [userId]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (userId) void load('silent');
    }, [load, userId]),
  );

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((_payload) => {
      void load('silent');
    });
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  function openWizard(preset: 'transfer' | 'tour' | 'dayTour') {
    router.push({
      pathname: '/(app)/new-booking',
      params: { preset },
    });
  }

  const activeBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === 'pending' || b.status === 'accepted' || b.status === 'in_progress',
      ),
    [bookings],
  );

  const recentActiveBookings = useMemo(
    () =>
      [...activeBookings]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 2),
    [activeBookings],
  );

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending').length,
    [bookings],
  );

  const spentThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return bookings
      .filter((b) => {
        if (b.status !== 'completed') return false;
        const d = new Date(b.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, b) => sum + Number(b.price_gel || 0), 0);
  }, [bookings]);

  async function handleCancelBooking(b: BookingRow) {
    if (__DEV__) {
      console.log('Cancelling booking ID:', b.id);
    }

    if (!userId) {
      if (Platform.OS === 'web') {
        window.alert(t('companyDashboard.sessionInactive'));
      } else {
        Alert.alert(t('common.error'), t('companyDashboard.sessionInactive'));
      }
      return;
    }

    if (b.status !== 'pending') {
      if (Platform.OS === 'web') {
        window.alert(t('companyDashboard.cancelPendingOnly'));
      } else {
        Alert.alert(t('companyDashboard.cancelBooking'), t('companyDashboard.cancelPendingOnly'));
      }
      return;
    }

    const run = async () => {
      if (__DEV__) {
        console.log('Cancelling booking ID (confirmed):', b.id);
      }
      setCancellingId(b.id);
      try {
        const res = await cancelBookingByCompany(b.id, userId);
        if (!res.ok) {
          const msg = res.error
            ? getSupabaseErrorMessage(res.error)
            : t('companyDashboard.cancelFailed');
          if (Platform.OS === 'web') {
            window.alert(msg);
          } else {
            Alert.alert(t('common.error'), msg);
          }
          return;
        }
        const successMsg = t('companyDashboard.cancelSuccess');
        if (Platform.OS === 'web') {
          window.alert(successMsg);
        } else {
          Alert.alert(t('companyDashboard.cancelBooking'), successMsg);
        }
        void load('silent');
      } finally {
        setCancellingId(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('companyDashboard.cancelConfirm'))) void run();
    } else {
      Alert.alert(t('companyDashboard.cancelBooking'), t('companyDashboard.cancelConfirm'), [
        { text: t('common.no'), style: 'cancel' },
        { text: t('companyDashboard.cancelBooking'), style: 'destructive', onPress: () => void run() },
      ]);
    }
  }

  async function openDriverModal(booking: BookingRow) {
    if (!booking.driver_id) return;
    setDriverModal(booking);
    setDriverProfile(null);
    setDriverLoading(true);
    const { data, error: profErr } = await fetchDriverProfile(booking.driver_id, {
      bookingVehicleId: booking.vehicle_id,
    });
    if (profErr) {
      setDriverProfile(null);
    } else {
      setDriverProfile(data);
    }
    setDriverLoading(false);
  }

  const modalMaxHeight = Math.round(Dimensions.get('window').height * 0.85);

  return (
    <>
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
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{t('company.greeting')}</Text>
          <NameWithVerifiedBadge
            name={name}
            verified={profile?.is_verified}
            textStyle={styles.name}
          />
        </View>
        <View style={styles.headerRight}>
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeLabel}>{t('company.bookingsBadge')}</Text>
            <Text style={styles.subBadgeTier}>
              {t('company.bookingsTotal', { count: totalCount })}
            </Text>
            <Text style={styles.subBadgeUntil}>
              {t('company.completedSpent', { amount: formatGel(spent) })}
            </Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t('company.quickBooking')}</Text>
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => openWizard('transfer')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.card, pressed && styles.pressed]}
        >
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.blueTint }]}>
            <Ionicons name="car-outline" size={22} color={COLORS.blue} />
          </View>
          <Text style={styles.quickTitle}>{t('common.transfer')}</Text>
        </Pressable>
        <Pressable
          onPress={() => openWizard('tour')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.card, pressed && styles.pressed]}
        >
          <View style={[styles.quickIconCircle, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="map-outline" size={22} color={COLORS.goldDark} />
          </View>
          <Text style={styles.quickTitle}>{t('common.tour')}</Text>
        </Pressable>
        <Pressable
          onPress={() => openWizard('dayTour')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.card, pressed && styles.pressed]}
        >
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.surfaceAlt }]}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.quickTitle}>{t('common.dayTour')}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionDivider} />
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('company.activeBookings')}</Text>
        <Pressable onPress={() => router.push('/(app)/new-booking')}>
          <Text style={styles.link}>{t('company.newBookingLink')}</Text>
        </Pressable>
      </View>

      <View style={styles.topStatsRow}>
        <View style={[styles.topStatCard, styles.topStatCardBlue]}>
          <Text style={styles.topStatValue}>{totalCount}</Text>
          <Text style={styles.topStatLabel}>{t('company.bookingsTotalStat')}</Text>
        </View>
        <View style={[styles.topStatCard, styles.topStatCardGold]}>
          <Text style={styles.topStatValue}>{pendingCount}</Text>
          <Text style={styles.topStatLabel}>{t('company.pendingStat')}</Text>
        </View>
        <View style={[styles.topStatCard, styles.topStatCardGreen]}>
          <Text style={[styles.topStatValue, styles.topStatValueSmall]}>
            {formatGel(spentThisMonth)}
          </Text>
          <Text style={styles.topStatLabel}>{t('company.spentMonthStat')}</Text>
        </View>
      </View>

      {loading ? (
        <BookingListSkeleton variant="company" />
      ) : activeBookings.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t('company.noActiveBookings')}
          subtitle={t('companyDashboard.emptyActiveSubtitle')}
        />
      ) : (
        <>
          {recentActiveBookings.map((b) => (
          <View key={b.id} style={[styles.bookingCard, bookingCardStatusBorder(b.status)]}>
            <View style={styles.bookingTop}>
              <Text style={styles.bookingType}>
                {bookingTypeLabel(b.kind, b.flight_direction)}
              </Text>
              <View style={[styles.statusPill, statusStyle(b.status)]}>
                <Text style={[styles.statusText, statusLabelColor(b.status)]}>
                  {bookingStatusLabel(b.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.route}>{routeSummary(b)}</Text>
            <Text style={styles.date}>{formatBookingDate(b)}</Text>
            <View style={styles.driverBlock}>
              <Text style={styles.driverLabel}>{t('company.operatorsOnTrip')}</Text>
              {b.host_display_name ? (
                <View style={styles.operatorRow}>
                  <Text style={styles.operatorRole}>{t('company.hostLabel')}</Text>
                  <Text style={styles.operatorName}>{b.host_display_name}</Text>
                </View>
              ) : null}
              {b.driver_display_name ? (
                <View style={styles.driverBlockInner}>
                  {b.host_display_name ? (
                    <Text style={styles.operatorRole}>{t('company.driverLabel')}</Text>
                  ) : null}
                  <View style={styles.driverNameRow}>
                    <UserAvatar
                      name={b.driver_display_name}
                      uri={b.driver_avatar_url ?? null}
                      size={36}
                    />
                    <View style={styles.driverNameInfo}>
                      <NameWithVerifiedBadge
                        name={b.driver_display_name}
                        verified={b.driver_is_verified}
                        isGuide={b.driver_is_guide_driver}
                        textStyle={styles.driverName}
                      />
                      <Text style={styles.driverMeta}>
                        {[b.driver_phone, b.driver_plate, b.vehicle_class ? vehicleClassLabel(b.vehicle_class) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Text style={styles.driverPending}>{t('common.selectingDriver')}</Text>
              )}
              {(b.status === 'accepted' || b.status === 'in_progress') && b.driver_id ? (
                <View style={styles.driverBtnRow}>
                  <Pressable onPress={() => void openDriverModal(b)} style={styles.driverBtn}>
                    <Text style={styles.driverBtnText}>👤 {t('common.viewDriver')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/tracking',
                        params: {
                          bookingId: b.id,
                          driverId: b.driver_id!,
                          driverName: b.driver_display_name ?? '',
                        },
                      })
                    }
                    style={styles.trackBtn}
                  >
                    <Ionicons name="navigate" size={14} color={COLORS.white} />
                    <Text style={styles.trackBtnText}>{t('common.track')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <Text style={styles.price}>{formatGel(Number(b.price_gel))}</Text>
            {b.status === 'pending' ? (
              <Pressable
                onPress={() => void handleCancelBooking(b)}
                disabled={cancellingId === b.id}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={({ pressed }) => [
                  styles.cancelBookingBtn,
                  (pressed || cancellingId === b.id) && styles.pressed,
                  cancellingId === b.id && styles.cancelBookingBtnDisabled,
                ]}
              >
                {cancellingId === b.id ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.cancelBookingBtnText}>{t('companyDashboard.cancelBooking')}</Text>
                )}
              </Pressable>
            ) : null}
            {b.status === 'in_progress' ? (
              <View style={styles.inProgressRow}>
                <View style={styles.inProgressBadge}>
                  <Ionicons name="navigate-outline" size={14} color={COLORS.goldDark} />
                  <Text style={styles.inProgressText}>{t('common.inProgress')}</Text>
                </View>
              </View>
            ) : null}
            {b.status === 'completed' && b.driver_id ? (
              isBookingAlreadyRated(b.id, ratedBookingIds) ? (
                <Pressable
                  onPress={() =>
                    router.push(
                      `/(app)/rate-booking?bookingId=${encodeURIComponent(b.id)}&driverId=${encodeURIComponent(b.driver_id!)}`,
                    )
                  }
                  style={({ pressed }) => [styles.ratedBadge, pressed && styles.pressed]}
                >
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.ratedBadgeText}>{t('rateBookingScreen.alreadyRated')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() =>
                    router.push(
                      `/(app)/rate-booking?bookingId=${encodeURIComponent(b.id)}&driverId=${encodeURIComponent(b.driver_id!)}`,
                    )
                  }
                  style={({ pressed }) => [styles.rateBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.rateBtnText}>{t('companyDashboard.rateDriver')}</Text>
                </Pressable>
              )
            ) : null}
            <Pressable
              onPress={() => openCompanyVoucher(router, b.id, setVoucherBooking, b)}
              style={styles.voucherBtn}
            >
              <Text style={styles.voucherBtnText}>📄 {t('common.voucher')}</Text>
            </Pressable>
          </View>
          ))}
          <Pressable
            onPress={() => router.push('/(app)/bookings')}
            style={({ pressed }) => [styles.historyLinkBtn, pressed && styles.pressed]}
          >
            <Text style={styles.historyLinkText}>სრული ისტორია →</Text>
          </Pressable>
        </>
      )}


      <PartnersAdsSection ads={ads} />

      <Text style={styles.sectionTitle}>{t('common.stats')}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalCount}</Text>
          <Text style={styles.statLabel}>{t('company.bookingsTotalStat')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatGel(spent)}</Text>
          <Text style={styles.statLabel}>{t('common.spentCompleted')}</Text>
        </View>
      </View>
    </ScrollView>

    <Modal
      visible={!!driverModal}
      animationType="slide"
      transparent
      onRequestClose={() => {
        setDriverModal(null);
        setDriverProfile(null);
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: modalMaxHeight }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {driverLoading ? (
              <ActivityIndicator color={COLORS.gold} size="large" style={{ margin: 32 }} />
            ) : driverProfile ? (
              <>
              <DriverProfileCard
                fullName={driverProfile.full_name || driverModal?.driver_display_name}
                avatarUrl={driverProfile.avatar_url}
                vehiclePhotoUrl={driverProfile.vehicle?.photo_front ?? null}
                vehicleInfo={
                  driverProfile.vehicle ? (
                    <>
                      <Text style={styles.vehicleTitle}>
                        {[driverProfile.vehicle.model, driverProfile.vehicle.year, driverProfile.vehicle.color]
                          .filter((x) => x !== null && x !== undefined && x !== '')
                          .join(' • ')}
                      </Text>
                      <View style={styles.chipRow}>
                        {driverProfile.vehicle.type ? (
                          <View style={styles.chip}>
                            <Text style={styles.chipText}>{vehicleTypeLabel(driverProfile.vehicle.type)}</Text>
                          </View>
                        ) : null}
                        {driverProfile.vehicle.class ? (
                          <View style={styles.chip}>
                            <Text style={styles.chipText}>{vehicleClassLabel(driverProfile.vehicle.class)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </>
                  ) : null
                }
                driverDetails={
                  <>
                    <NameWithVerifiedBadge
                      name={
                        driverProfile.full_name ||
                        driverModal?.driver_display_name ||
                        t('company.driverDefault')
                      }
                      verified={driverProfile.is_verified}
                      isGuide={driverProfile.is_guide_driver}
                      textStyle={styles.driverNameModal}
                    />
                    <Text style={styles.ratingText}>
                      ⭐{' '}
                      {driverProfile.rating.count > 0
                        ? t('company.ratingFormat', {
                            avg: driverProfile.rating.average.toFixed(1),
                            count: driverProfile.rating.count,
                          })
                        : t('company.noRatings')}
                    </Text>
                  </>
                }
                footer={
                  <>
                    {driverProfile.experience_years != null && driverProfile.experience_years > 0 ? (
                      <Text style={styles.infoText}>
                        🕐{' '}
                        {t('company.experienceYears', { years: driverProfile.experience_years })}
                      </Text>
                    ) : null}
                    {driverProfile.languages && driverProfile.languages.length > 0 ? (
                      <View style={styles.chipRow}>
                        {driverProfile.languages.map((lang) => (
                          <View key={lang} style={styles.chip}>
                            <Text style={styles.chipText}>{lang}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {driverProfile.bio ? <Text style={styles.bioText}>{driverProfile.bio}</Text> : null}
                  </>
                }
              />
            {driverModal?.driver_id && user?.id ? (
              <BookingChatThreads
                bookingId={driverModal.id}
                viewerUserId={user.id}
                chatStack="app"
              />
            ) : null}
              </>
            ) : (
              <Text style={styles.modalEmptyText}>{t('company.driverInfoNotFound')}</Text>
            )}
          </ScrollView>

          <Pressable
            onPress={() => {
              setDriverModal(null);
              setDriverProfile(null);
            }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <CompanyBookingVoucherModal
      booking={voucherBooking}
      visible={!!voucherBooking}
      onClose={() => setVoucherBooking(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  adminBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
  },
  adminBtnPressed: {
    opacity: 0.85,
  },
  adminBtnText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  signOutPressed: {
    opacity: 0.75,
  },
  signOutText: {
    color: COLORS.gray,
    fontSize: 13,
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
  subBadge: {
    backgroundColor: '#FFF4DC',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.goldLight,
    ...SHADOWS.card,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minWidth: 120,
  },
  subBadgeLabel: {
    color: COLORS.gray,
    fontSize: 11,
    fontWeight: '600',
  },
  subBadgeTier: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  subBadgeUntil: {
    color: COLORS.grayLight,
    fontSize: 11,
    marginTop: 4,
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
    marginBottom: SPACING.md,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  topStatsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  topStatCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.cardStrong,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  topStatCardBlue: {
    borderLeftColor: COLORS.blue,
  },
  topStatCardGold: {
    borderLeftColor: COLORS.gold,
  },
  topStatCardGreen: {
    borderLeftColor: COLORS.success,
  },
  topStatValue: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  topStatValueSmall: {
    fontSize: 20,
  },
  topStatLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
  },
  historyLinkBtn: {
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  historyLinkText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  quickIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  quickTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
  listLoading: {
    paddingVertical: SPACING.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  bookingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.cardStrong,
  },
  bookingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  bookingType: {
    color: COLORS.goldLight,
    fontSize: 13,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgePending: {
    backgroundColor: '#F3F4F6',
  },
  badgeAccepted: {
    backgroundColor: '#DBEAFE',
  },
  badgeInProgress: {
    backgroundColor: '#FFEDD5',
  },
  badgeCompleted: {
    backgroundColor: '#D1FAE5',
  },
  badgeLive: {
    backgroundColor: '#FEF3C7',
  },
  badgeOk: {
    backgroundColor: '#D1FAE5',
  },
  badgeBad: {
    backgroundColor: '#FEE2E2',
  },
  badgeMuted: {
    backgroundColor: COLORS.surfaceAlt,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  route: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  date: {
    color: COLORS.gray,
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  driverBlock: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  driverLabel: {
    color: COLORS.gray,
    fontSize: 12,
    marginBottom: 4,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  driverNameInfo: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  driverMeta: {
    color: COLORS.grayLight,
    fontSize: 13,
    marginTop: 4,
  },
  hostMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  driverBlockInner: {
    gap: 4,
    marginTop: 4,
  },
  operatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  operatorRole: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  operatorName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  driverPending: {
    color: COLORS.gray,
    fontSize: 14,
    fontStyle: 'italic',
  },
  driverBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  driverBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  driverBtnText: {
    color: COLORS.grayLight,
    fontSize: 13,
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  trackBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBookingBtn: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.error,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 40,
  },
  cancelBookingBtnDisabled: {
    opacity: 0.7,
  },
  cancelBookingBtnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  inProgressRow: {
    marginTop: SPACING.sm,
  },
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.goldTint,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  inProgressText: {
    color: COLORS.goldDark,
    fontWeight: '700',
    fontSize: 13,
  },
  rateBtn: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  rateBtnText: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: 14,
  },
  ratedBadge: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  ratedBadgeText: {
    color: COLORS.success,
    fontWeight: '800',
    fontSize: 14,
  },
  voucherBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  voucherBtnText: {
    color: COLORS.grayLight,
    fontSize: 13,
  },
  price: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.gold,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.grayLight,
    fontSize: 13,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderRadius: 20,
    padding: SPACING.lg,
  },
  vehicleTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  chipText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  driverNameModal: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  ratingText: {
    color: COLORS.gold,
    fontSize: 13,
    marginTop: 2,
  },
  infoText: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginBottom: SPACING.sm,
  },
  bioText: {
    color: COLORS.grayLight,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  modalEmptyText: {
    color: COLORS.gray,
    textAlign: 'center',
    padding: 32,
  },
  closeBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  closeBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
});
