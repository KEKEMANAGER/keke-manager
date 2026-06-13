import type { User } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingChangedBadge } from '../../components/BookingChangedBadge';
import { BookingPriceDisplay } from '../../components/BookingPriceDisplay';
import { FleetDriverPayoutModal } from '../../components/FleetDriverPayoutModal';
import { FleetHostAcceptModal } from '../../components/FleetHostAcceptModal';
import { BookingPaymentConfirm } from '../../components/BookingPaymentConfirm';
import { BookingVoucherModal } from '../../components/BookingVoucherModal';
import { EmptyState } from '../../components/EmptyState';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { tabBarMinHeight, Z_INDEX } from '../../constants/layout';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { BookingRealtimeRecord, BookingRow, BookingStatus } from '../../lib/bookings';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  canDriverConfirmUpcomingBooking,
  confirmDriverOneHourBooking,
  isDriverOneHourConfirmed,
} from '../../lib/bookingReminders';
import {
  acceptBooking,
  bookingStatusLabel,
  bookingTypeLabel,
  cancelBookingByDriver,
  completeBooking,
  fetchBookingsForDriver,
  fetchBookingsForHost,
  fetchOpenPendingBookingsForDriver,
  formatBookingDate,
  hostAcceptBookingForSub,
  isNewOpenPendingBookingInsert,
  isTourBookingKind,
  rejectBooking,
  routeSummary,
  startBookingTrip,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import {
  fetchAcceptedFleetMembersForHost,
  fetchFleetContext,
  type FleetMemberView,
} from '../../lib/fleet';
import { parseDriverPayoutInput } from '../../lib/bookingPayout';
import { navigateToTripGps } from '../../lib/tripGpsNavigation';
import {
  completeTourTripWithOdometer,
  odometerErrorMessageKey,
  startTourTripWithOdometer,
} from '../../lib/tourTripLifecycle';
import { stopBackgroundLocation } from '../../lib/backgroundLocation';
import { clearDriverLocation } from '../../lib/locations';
import { notifyNewOpenBookingIfMatchesDriver } from '../../lib/localNotifications';
import i18n from '../../src/lib/i18n';

function crossAlert(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = i18n.t('common.yes'),
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: confirmText, onPress: onConfirm },
    ]);
  }
}

function crossInfoAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

type BookingTabKey = 'open' | 'active' | 'completed';

function driverDisplayName(user: User | null, profile: Profile | null, fallback: string) {
  const full = profile?.full_name?.trim();
  if (full) return full;
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const nm = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (nm) return nm;
  return user?.email?.split('@')[0] || fallback;
}

function driverPhone(_user: User | null, profile: Profile | null) {
  return profile?.phone?.trim() || '';
}

function driverPlateFromMeta(user: User | null) {
  const m = user?.user_metadata;
  if (!m || typeof m !== 'object') return '';
  const p = (m as Record<string, unknown>).vehiclePlate;
  return typeof p === 'string' ? p : '';
}

function statusPillWrap(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return { backgroundColor: '#F3F4F6' };
    case 'accepted':
      return { backgroundColor: '#DBEAFE' };
    case 'in_progress':
      return { backgroundColor: '#FFEDD5' };
    case 'completed':
      return { backgroundColor: '#D1FAE5' };
    case 'cancelled':
    case 'rejected':
      return { backgroundColor: '#FEE2E2' };
    default:
      return { backgroundColor: COLORS.surfaceAlt };
  }
}

function statusPillTextColor(status: BookingStatus): { color: string } {
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

export default function DriverBookingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const tabs = useMemo(
    (): { key: BookingTabKey; label: string }[] => [
      { key: 'open', label: t('bookings.tabs.pending') },
      { key: 'active', label: t('bookings.tabs.active') },
      { key: 'completed', label: t('bookings.tabs.completed') },
    ],
    [t],
  );
  const userId = user?.id;
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const highlightBookingId = useMemo(() => {
    const raw = params.bookingId;
    const single = Array.isArray(raw) ? raw[0] : raw;
    return typeof single === 'string' ? single.trim() : '';
  }, [params.bookingId]);
  const listRef = useRef<FlatList<BookingRow>>(null);

  const [tab, setTab] = useState<BookingTabKey>('open');
  const [openJobs, setOpenJobs] = useState<BookingRow[]>([]);
  const [assigned, setAssigned] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [openListHint, setOpenListHint] = useState<'profile_vehicle_required' | null>(null);
  const [voucherBooking, setVoucherBooking] = useState<BookingRow | null>(null);
  const [payoutPending, setPayoutPending] = useState<{
    item: BookingRow;
    member: FleetMemberView;
  } | null>(null);
  const [fleetAssignPending, setFleetAssignPending] = useState<{
    item: BookingRow;
    members: FleetMemberView[];
  } | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!userId) {
      setOpenJobs([]);
      setAssigned([]);
      setOpenListHint(null);
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      return;
    }
    setError(null);
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const fleetCtx = await fetchFleetContext(userId);
    const results = await Promise.all([
      fetchOpenPendingBookingsForDriver(userId),
      fetchBookingsForDriver(userId),
      fleetCtx.kind === 'host' ? fetchBookingsForHost(userId) : Promise.resolve({ data: [], error: null }),
    ]);
    const openRes = results[0]!;
    const mineRes = results[1]!;
    const hostRes = results[2]!;

    if (mode === 'initial') setLoading(false);
    if (mode === 'refresh') setRefreshing(false);

    if (openRes.error) {
      setError(openRes.error.message);
      setOpenJobs([]);
      setOpenListHint(null);
    } else {
      setOpenJobs(openRes.data);
      setOpenListHint(openRes.hint ?? null);
    }
    if (mineRes.error && hostRes.error) {
      if (!openRes.error) setError(mineRes.error.message);
      setAssigned([]);
    } else {
      const merged = [...mineRes.data];
      for (const row of hostRes.data) {
        if (!merged.some((b) => b.id === row.id)) merged.push(row);
      }
      merged.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      setAssigned(merged);
    }
  }, [userId]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((payload) => {
      void load('silent');
      if (Platform.OS !== 'web' && isNewOpenPendingBookingInsert(payload) && userId) {
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
  }, [userId, load]);

  const data = useMemo(() => {
    if (tab === 'open') return openJobs;
    if (tab === 'active') {
      return assigned.filter((b) => b.status === 'accepted' || b.status === 'in_progress');
    }
    return assigned.filter((b) => b.status === 'completed');
  }, [tab, openJobs, assigned]);

  const activeInProgressTrip = useMemo(
    () => (tab === 'active' ? data.find((b) => b.status === 'in_progress') ?? null : null),
    [tab, data],
  );

  const tabBarHeight = tabBarMinHeight(insets.bottom);

  useEffect(() => {
    if (!highlightBookingId || loading) return;
    if (openJobs.some((b) => b.id === highlightBookingId)) {
      setTab('open');
      return;
    }
    const mine = assigned.find((b) => b.id === highlightBookingId);
    if (!mine) return;
    if (mine.status === 'completed') setTab('completed');
    else if (mine.status === 'accepted' || mine.status === 'in_progress') setTab('active');
    else setTab('open');
  }, [highlightBookingId, loading, openJobs, assigned]);

  useEffect(() => {
    if (!highlightBookingId || loading) return;
    const index = data.findIndex((b) => b.id === highlightBookingId);
    if (index < 0 || !listRef.current) return;
    const frame = requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.12, animated: true });
      } catch {
        /* list not laid out */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightBookingId, loading, data, tab]);

  async function acceptAsSub(
    item: BookingRow,
    member: FleetMemberView,
    driverPayoutGel: number,
  ) {
    if (!user) return;
    setActingId(item.id);
    const subName =
      member.sub_full_name?.trim() || member.sub_email?.trim() || t('common.driver');
    const plate = member.vehicle?.plate?.trim() ?? '';
    const res = await hostAcceptBookingForSub(item.id, user.id, member.sub_driver_id, {
      displayName: subName,
      phone: '',
      plate,
      driverPayoutGel,
    });
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert(t('common.error'), res.error?.message || t('bookings.acceptFailed'));
      void load('silent');
      return;
    }
    void load('silent');
    setTab('active');
  }

  function beginAssignToSub(item: BookingRow, member: FleetMemberView) {
    const total = Number(item.price_gel || 0);
    const subName =
      member.sub_full_name?.trim() || member.sub_email?.trim() || t('common.driver');

    if (Platform.OS === 'web') {
      const raw =
        typeof window !== 'undefined'
          ? window.prompt(
              `${t('fleet.payoutModalSub', { name: subName, total: total.toLocaleString('ka-GE') })}\n${t('fleet.payoutPlaceholder')}`,
            )
          : null;
      if (raw == null) return;
      const parsed = parseDriverPayoutInput(raw, total);
      if (!parsed.ok) {
        crossInfoAlert(t('common.error'), t('fleet.payoutInvalid'));
        return;
      }
      void acceptAsSub(item, member, parsed.value);
      return;
    }

    if (Platform.OS === 'ios') {
      Alert.prompt(
        t('fleet.payoutModalTitle'),
        t('fleet.payoutModalSub', { name: subName, total: total.toLocaleString('ka-GE') }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            onPress: (text?: string) => {
              const parsed = parseDriverPayoutInput(text ?? '', total);
              if (!parsed.ok) {
                crossInfoAlert(t('common.error'), t('fleet.payoutInvalid'));
                return;
              }
              void acceptAsSub(item, member, parsed.value);
            },
          },
        ],
        'plain-text',
        '',
        'decimal-pad',
      );
      return;
    }

    setPayoutPending({ item, member });
  }

  async function acceptAsSelf(item: BookingRow) {
    if (!user) return;
    setActingId(item.id);
    const res = await acceptBooking(item.id, {
      driverId: user.id,
      displayName: driverDisplayName(user, profile, t('driver.defaultName')),
      phone: driverPhone(user, profile),
      plate: driverPlateFromMeta(user),
    });
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert(t('common.error'), res.error?.message || t('bookings.acceptFailed'));
      void load('silent');
      return;
    }
    void load('silent');
    setTab('active');
  }

  function showFleetAssignPicker(item: BookingRow, fleetMembers: FleetMemberView[]) {
    setFleetAssignPending({ item, members: fleetMembers });
  }

  async function onAccept(item: BookingRow) {
    if (!user) return;

    // Targeted booking (company picked this driver): personal, can't go to a sub.
    const targetedDriverId = String(item.driver_id ?? '').trim();
    if (targetedDriverId && targetedDriverId === user.id) {
      await acceptAsSelf(item);
      return;
    }

    const { data: fleetMembers } = await fetchAcceptedFleetMembersForHost(user.id);
    if (fleetMembers.length > 0) {
      showFleetAssignPicker(item, fleetMembers);
      return;
    }

    await acceptAsSelf(item);
  }

  async function handleReject(item: BookingRow) {
    setActingId(item.id);
    const res = await rejectBooking(item.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert(t('common.error'), res.error?.message || t('bookings.rejectFailed'));
      void load('silent');
      return;
    }
    setOpenJobs((prev) => prev.filter((b) => b.id !== item.id));
    setAssigned((prev) => prev.filter((b) => b.id !== item.id));
    void load('silent');
  }

  async function onComplete(item: BookingRow) {
    if (!user?.id) return;
    setActingId(item.id);
    const res = isTourBookingKind(item.kind)
      ? await completeTourTripWithOdometer(item, user.id)
      : await completeBooking(item.id, user.id).then((r) =>
          r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? new Error('complete_failed') },
        );
    setActingId(null);
    if (!res.ok) {
      if ('cancelled' in res && res.cancelled) return;
      const err = 'error' in res ? res.error : null;
      const errMessage = err instanceof Error ? err.message : null;
      crossInfoAlert(
        t('common.error'),
        getSupabaseErrorMessage(err) ||
          errMessage ||
          t(odometerErrorMessageKey(err)) ||
          t('bookings.completeFailed'),
      );
      void load('silent');
      return;
    }
    if (Platform.OS !== 'web') {
      await stopBackgroundLocation();
      const { error: clearErr } = await clearDriverLocation(user.id);
      if (clearErr && __DEV__) console.warn('[bookings] clearDriverLocation:', clearErr.message);
    }
    crossInfoAlert(t('common.success'), t('bookings.completeSuccess'));
    void load('silent');
    setTab('completed');
  }

  async function handleCancel(item: BookingRow) {
    if (!user?.id) return;
    setActingId(item.id);
    const res = await cancelBookingByDriver(item.id, user.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert(
        t('common.error'),
        getSupabaseErrorMessage(res.error) || t('bookings.cancelFailed'),
      );
      void load('silent');
      return;
    }
    crossInfoAlert(t('common.success'), t('bookings.cancelSuccess'));
    void load('silent');
  }

  function confirmCancel(item: BookingRow) {
    crossAlert(
      t('bookings.cancelConfirmTitle'),
      t('bookings.cancelConfirmMessage'),
      () => void handleCancel(item),
      t('bookings.cancel'),
    );
  }

  async function onConfirmUpcoming(item: BookingRow) {
    if (!user?.id) return;
    setActingId(item.id);
    const res = await confirmDriverOneHourBooking(item.id, user.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert(
        t('common.error'),
        getSupabaseErrorMessage(res.error) || t('bookings.confirmUpcomingFailed'),
      );
      void load('silent');
      return;
    }
    void load('silent');
  }

  async function onStartTrip(item: BookingRow) {
    if (!user?.id) return;
    setActingId(item.id);
    const res = isTourBookingKind(item.kind)
      ? await startTourTripWithOdometer(item, user.id)
      : await startBookingTrip(item.id, user.id).then((r) =>
          r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? new Error('start_failed') },
        );
    setActingId(null);
    if (!res.ok) {
      if ('cancelled' in res && res.cancelled) return;
      crossInfoAlert(
        t('common.error'),
        getSupabaseErrorMessage('error' in res ? res.error : null) ||
          t(odometerErrorMessageKey('error' in res ? res.error : null)) ||
          t('bookings.startFailed'),
      );
      void load('silent');
      return;
    }
    void load('silent');
    navigateToTripGps(router, item.id);
  }

  const emptyForTab = useMemo(() => {
    switch (tab) {
      case 'open':
        if (openListHint === 'profile_vehicle_required') {
          return {
            icon: 'calendar' as const,
            title: t('bookings.empty.profileVehicleTitle'),
            subtitle: t('bookings.empty.profileVehicleSubtitle'),
          };
        }
        return {
          icon: 'calendar' as const,
          title: t('bookings.empty.pendingTitle'),
          subtitle: t('bookings.empty.pendingSubtitle'),
        };
      case 'active':
        return {
          icon: 'calendar' as const,
          title: t('bookings.empty.activeTitle'),
          subtitle: t('bookings.empty.activeSubtitle'),
        };
      default:
        return {
          icon: 'archive' as const,
          title: t('bookings.empty.completedTitle'),
          subtitle: t('bookings.empty.completedSubtitle'),
        };
    }
  }, [tab, openListHint, t]);

  // ── Verification gate ──────────────────────────────────────────────────────
  const isVerified = profile?.verification_status === 'approved' && profile?.is_verified === true;
  const isHired = profile?.is_hired_driver === true;

  if (!isVerified || isHired) {
    return (
      <View style={[styles.screen, styles.gateWrap, { paddingTop: insets.top + SPACING.xl }]}>
        <Text style={styles.gateIcon}>🔒</Text>
        <Text style={styles.gateTitle}>
          {isHired
            ? 'წვდომა შეზღუდულია'
            : 'ვერიფიკაცია საჭიროა'}
        </Text>
        <Text style={styles.gateSubtitle}>
          {isHired
            ? t('hiredDriver.bookingsGateHint')
            : 'ჯავშნების სანახავად ადმინის ვერიფიკაცია გჭირდება. გთხოვ დაელოდო დამტკიცებას.'}
        </Text>
        {isHired ? (
          <Pressable onPress={() => router.replace('/(driver)/dashboard')} style={styles.gateBtn}>
            <Text style={styles.gateBtnText}>{t('hiredDriver.goDashboard')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(driver)/verification' as never)}
            style={styles.gateBtn}
          >
            <Text style={styles.gateBtnText}>{t('menu.verification')}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
      <Text style={styles.title}>{t('bookings.title')}</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabRow}>
        {tabs.map((tabItem) => (
          <Pressable
            key={tabItem.key}
            onPress={() => setTab(tabItem.key)}
            style={[styles.tab, tab === tabItem.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === tabItem.key && styles.tabTextActive]}>
              {tabItem.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerLoad}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) => item.id}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({ index, viewPosition: 0.12, animated: true });
              } catch {
                /* ignore */
              }
            }, 120);
          }}
          contentContainerStyle={[
            styles.list,
            data.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + SPACING.xl + (activeInProgressTrip ? tabBarHeight + 72 : 96) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={COLORS.gold}
              colors={[COLORS.gold]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={emptyForTab.icon}
              title={emptyForTab.title}
              subtitle={emptyForTab.subtitle}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[styles.card, highlightBookingId === item.id && styles.cardHighlight]}
            >
              <View style={styles.cardHead}>
                <View style={[styles.statusPill, statusPillWrap(item.status)]}>
                  <Text style={[styles.statusPillText, statusPillTextColor(item.status)]}>
                    {bookingStatusLabel(item.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.kind}>{bookingTypeLabel(item.kind, item.flight_direction)}</Text>
              <NameWithVerifiedBadge
                name={item.company_name || t('common.companyDefault')}
                verified={item.company_is_verified}
                textStyle={styles.company}
              />
              {item.created_by_name?.trim() ? (
                <Text style={styles.operator}>
                  {t('bookings.operatorLine', { name: item.created_by_name.trim() })}
                </Text>
              ) : null}
              <Text style={styles.date}>{formatBookingDate(item)}</Text>
              <Text style={styles.route}>{routeSummary(item)}</Text>
              <BookingChangedBadge booking={item} onAcknowledged={() => void load('silent')} />

              {item.status === 'in_progress' ? (
                <Pressable
                  onPress={() => void onComplete(item)}
                  disabled={actingId === item.id}
                  style={({ pressed }) => [styles.completeBtnFull, pressed && styles.pressed]}
                >
                  {actingId === item.id ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <Text style={styles.btnGoldText}>{t('bookings.complete')}</Text>
                  )}
                </Pressable>
              ) : null}

              {item.status === 'accepted' &&
              (isDriverOneHourConfirmed(item) || canDriverConfirmUpcomingBooking(item)) ? (
                <View style={styles.confirmRow}>
                  {isDriverOneHourConfirmed(item) ? (
                    <Text style={styles.confirmDoneText}>{t('bookings.confirmedUpcoming')}</Text>
                  ) : (
                    <Pressable
                      onPress={() => void onConfirmUpcoming(item)}
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color={COLORS.white} size="small" />
                      ) : (
                        <Text style={styles.confirmBtnText}>{t('bookings.confirmUpcoming')}</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              ) : null}
              <Pressable
                onPress={() => setVoucherBooking(item)}
                style={({ pressed }) => [styles.voucherBtn, pressed && styles.pressed]}
              >
                <Text style={styles.voucherBtnText}>📄 {t('common.voucher')}</Text>
              </Pressable>

              <View style={[styles.footer, item.status === 'in_progress' && styles.footerInProgress]}>
                {userId ? (
                  <BookingPriceDisplay booking={item} viewerUserId={userId} />
                ) : (
                  <Text style={styles.price}>
                    {Number(item.price_gel).toLocaleString('ka-GE')} ₾
                  </Text>
                )}
                {item.status === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() =>
                        crossAlert(
                          t('bookings.rejectTitle'),
                          t('bookings.rejectMessage'),
                          () => void handleReject(item),
                          t('bookings.decline'),
                        )
                      }
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color={COLORS.grayLight} size="small" />
                      ) : (
                        <Text style={styles.btnGhostText}>{t('bookings.decline')}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        crossAlert(
                          t('bookings.acceptTitle'),
                          t('bookings.acceptMessage'),
                          () => void onAccept(item),
                          t('bookings.accept'),
                        )
                      }
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color={COLORS.white} size="small" />
                      ) : (
                        <Text style={styles.btnGoldText}>{t('bookings.accept')}</Text>
                      )}
                    </Pressable>
                  </View>
                ) : item.status === 'accepted' ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => confirmCancel(item)}
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
                    >
                      <Text style={styles.btnGhostText}>{t('bookings.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void onStartTrip(item)}
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color={COLORS.white} size="small" />
                      ) : (
                        <Text style={styles.btnGoldText}>{t('bookings.startTrip')}</Text>
                      )}
                    </Pressable>
                  </View>
                ) : item.status === 'completed' && user?.id ? (
                  <BookingPaymentConfirm
                    booking={item}
                    driverUserId={user.id}
                    actingId={actingId}
                    setActingId={setActingId}
                    onUpdated={() => void load('silent')}
                  />
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      <BookingVoucherModal
        booking={voucherBooking}
        visible={!!voucherBooking}
        onClose={() => setVoucherBooking(null)}
      />
      {fleetAssignPending ? (
        <FleetHostAcceptModal
          visible
          fleetMembers={fleetAssignPending.members}
          onCancel={() => setFleetAssignPending(null)}
          onSelectSelf={() => {
            const pending = fleetAssignPending;
            setFleetAssignPending(null);
            void acceptAsSelf(pending.item);
          }}
          onSelectMember={(member) => {
            const pending = fleetAssignPending;
            setFleetAssignPending(null);
            beginAssignToSub(pending.item, member);
          }}
        />
      ) : null}
      {payoutPending ? (
        <FleetDriverPayoutModal
          visible
          driverName={
            payoutPending.member.sub_full_name?.trim() ||
            payoutPending.member.sub_email?.trim() ||
            t('common.driver')
          }
          tripTotalGel={Number(payoutPending.item.price_gel || 0)}
          onCancel={() => setPayoutPending(null)}
          onConfirm={(payoutGel) => {
            const pending = payoutPending;
            setPayoutPending(null);
            void acceptAsSub(pending.item, pending.member, payoutGel);
          }}
        />
      ) : null}

      {activeInProgressTrip ? (
        <View style={[styles.stickyCompleteWrap, { bottom: tabBarHeight }]}>
          <Pressable
            onPress={() => void onComplete(activeInProgressTrip)}
            disabled={actingId === activeInProgressTrip.id}
            style={({ pressed }) => [
              styles.stickyCompleteBtn,
              (pressed || actingId === activeInProgressTrip.id) && styles.pressed,
            ]}
          >
            {actingId === activeInProgressTrip.id ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.stickyCompleteText}>{t('bookings.complete')}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  gateIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f0f0f',
    textAlign: 'center',
    marginBottom: 10,
  },
  gateSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  gateBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
  },
  gateBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: SPACING.md,
  },
  errorBanner: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244,67,54,0.1)',
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
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  retryText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  tabActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
  },
  tabText: {
    color: COLORS.gray,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabTextActive: {
    color: COLORS.goldLight,
  },
  centerLoad: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  list: {
    paddingTop: SPACING.sm,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardHighlight: {
    borderColor: COLORS.gold,
    borderLeftColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: SPACING.xs,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  kind: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.goldDark,
    marginBottom: 4,
  },
  company: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  operator: {
    color: COLORS.gray,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  date: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  route: {
    color: COLORS.grayLight,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  confirmRow: {
    marginBottom: SPACING.sm,
  },
  confirmBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
  },
  confirmBtnText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
  confirmDoneText: {
    color: '#047857',
    fontWeight: '700',
    fontSize: 14,
  },
  voucherBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    marginBottom: SPACING.sm,
  },
  voucherBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.goldDark,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerInProgress: {
    marginTop: SPACING.sm,
  },
  price: {
    color: COLORS.goldLight,
    fontSize: 20,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  completeBtnFull: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingVertical: 16,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 48,
  },
  stickyCompleteWrap: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: Z_INDEX.floating,
    ...SHADOWS.card,
  },
  stickyCompleteBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.goldDark,
  },
  stickyCompleteText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 16,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 88,
    alignItems: 'center',
  },
  btnGhostText: {
    color: COLORS.grayLight,
    fontWeight: '700',
    fontSize: 14,
  },
  btnGold: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoldText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
  completedLabel: {
    color: COLORS.success,
    fontWeight: '700',
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
