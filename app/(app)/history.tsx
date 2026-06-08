import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { BookingOdometerSection } from '../../components/BookingOdometerSection';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { BookingRow, BookingStatus } from '../../lib/bookings';
import {
  bookingStatusLabel,
  bookingTypeLabel,
  fetchBookingsByCompanyId,
  formatBookingDate,
  normalizeBookingKind,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import {
  CompanyBookingVoucherModal,
  openCompanyVoucher,
} from '../../components/CompanyBookingVoucher';
import { useAuth } from '../../contexts/AuthContext';
import { canCompanyEditBooking } from '../../lib/bookingUpdate';
import {
  fetchRatedBookingIdsForCompany,
  isBookingAlreadyRated,
} from '../../lib/ratings';

type FilterKey = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';
type KindFilterKey = 'all' | 'transfer' | 'tour' | 'day_tour';

const FILTER_ACTIVE = '#EF9F27';

const FILTERS: FilterKey[] = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];
const KIND_FILTERS: KindFilterKey[] = ['all', 'transfer', 'tour', 'day_tour'];

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function statusColor(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return '#9CA3AF';
    case 'accepted':
      return '#3B82F6';
    case 'in_progress':
      return COLORS.gold;
    case 'completed':
      return COLORS.success;
    case 'rejected':
    case 'cancelled':
      return COLORS.error;
    default:
      return COLORS.gray;
  }
}

function matchesKindFilter(row: BookingRow, kindFilter: KindFilterKey): boolean {
  if (kindFilter === 'all') return true;
  return normalizeBookingKind(row.kind) === kindFilter;
}

function matchesFilter(row: BookingRow, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return row.status === 'pending';
  if (filter === 'confirmed') return row.status === 'accepted' || row.status === 'in_progress';
  if (filter === 'completed') return row.status === 'completed';
  if (filter === 'cancelled') return row.status === 'rejected' || row.status === 'cancelled';
  return true;
}

export default function CompanyHistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const filterLabels = useMemo(
    (): Record<FilterKey, string> => ({
      all: t('historyPage.filters.all'),
      pending: t('historyPage.filters.pending'),
      confirmed: t('historyPage.filters.confirmed'),
      completed: t('historyPage.filters.completed'),
      cancelled: t('historyPage.filters.cancelled'),
    }),
    [t],
  );

  const kindFilterLabels = useMemo(
    (): Record<KindFilterKey, string> => ({
      all: t('historyPage.filters.all'),
      transfer: t('booking.type.transfer'),
      tour: t('booking.type.tour'),
      day_tour: t('booking.type.day_tour'),
    }),
    [t],
  );

  const [filter, setFilter] = useState<FilterKey>('all');
  const [kindFilter, setKindFilter] = useState<KindFilterKey>('all');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [voucherBooking, setVoucherBooking] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (!userId) {
      setRows([]);
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      return;
    }
    setError(null);
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const [bookingsRes, ratedRes] = await Promise.all([
      fetchBookingsByCompanyId(userId),
      fetchRatedBookingIdsForCompany(userId),
    ]);

    if (mode === 'initial') setLoading(false);
    if (mode === 'refresh') setRefreshing(false);

    setRatedBookingIds(ratedRes.ids);

    if (bookingsRes.error) {
      setError(bookingsRes.error.message);
      setRows([]);
    } else {
      setRows(bookingsRes.data);
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

  const filtered = useMemo(
    () => rows.filter((r) => matchesFilter(r, filter) && matchesKindFilter(r, kindFilter)),
    [rows, filter, kindFilter],
  );

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filter !== 'all') parts.push(filterLabels[filter]);
    if (kindFilter !== 'all') parts.push(kindFilterLabels[kindFilter]);
    return parts.join(' · ');
  }, [filter, kindFilter, filterLabels, kindFilterLabels]);

  function historyEmptyMessages(f: FilterKey): {
    icon: 'calendar' | 'archive' | 'time-outline';
    title: string;
    subtitle: string;
  } {
    switch (f) {
      case 'pending':
        return {
          icon: 'time-outline',
          title: t('historyPage.empty.pendingTitle'),
          subtitle: t('historyPage.empty.pendingSubtitle'),
        };
      case 'confirmed':
        return {
          icon: 'calendar',
          title: t('historyPage.empty.confirmedTitle'),
          subtitle: t('historyPage.empty.confirmedSubtitle'),
        };
      case 'completed':
        return {
          icon: 'archive',
          title: t('historyPage.empty.completedTitle'),
          subtitle: t('historyPage.empty.completedSubtitle'),
        };
      case 'cancelled':
        return {
          icon: 'archive',
          title: t('historyPage.empty.cancelledTitle'),
          subtitle: t('historyPage.empty.cancelledSubtitle'),
        };
      default:
        return {
          icon: 'archive',
          title: t('historyPage.empty.allTitle'),
          subtitle: t('historyPage.empty.allSubtitle'),
        };
    }
  }

  const emptyMeta = historyEmptyMessages(filter);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: SPACING.sm,
            paddingBottom: insets.bottom + SPACING.xl + 72,
            paddingHorizontal: SPACING.lg,
          },
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
        <Text style={styles.title}>{t('historyPage.title')}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {filterLabels[f]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kindFilterStrip}
        >
          {KIND_FILTERS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKindFilter(k)}
              style={[styles.filterChip, kindFilter === k && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, kindFilter === k && styles.filterTextActive]}>
                {kindFilterLabels[k]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sub}>
          {t('historyPage.shownCount', { count: filtered.length })}
          {activeFilterSummary ? t('historyPage.filterActive', { filter: activeFilterSummary }) : ''}
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.gold} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={emptyMeta.icon}
            title={emptyMeta.title}
            subtitle={emptyMeta.subtitle}
          />
        ) : (
          filtered.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.type}>{bookingTypeLabel(r.kind, r.flight_direction)}</Text>
                <Text style={[styles.status, { color: statusColor(r.status) }]}>
                  {bookingStatusLabel(r.status)}
                </Text>
              </View>
              <Text style={styles.route}>{routeSummary(r)}</Text>
              <View style={styles.cardBottom}>
                <Text style={styles.date}>{formatBookingDate(r)}</Text>
                <Text style={styles.price}>{formatGel(Number(r.price_gel))}</Text>
              </View>
              {canCompanyEditBooking(r.status).allowed ? (
                <Pressable
                  onPress={() => router.push(`/(app)/edit-booking/${r.id}` as never)}
                  style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
                >
                  <Text style={styles.editBtnText}>✏️ {t('editBooking.edit')}</Text>
                </Pressable>
              ) : null}
              <BookingOdometerSection booking={r} compact />
              <Pressable
                onPress={() => openCompanyVoucher(router, r.id, setVoucherBooking, r)}
                style={styles.voucherBtn}
              >
                <Text style={styles.voucherBtnText}>📄 {t('historyPage.voucher')}</Text>
              </Pressable>
              {/* rate-booking: bookingId = booking.id (uuid), driverId = driver user id. */}
              {r.status === 'completed' && r.driver_id ? (
                isBookingAlreadyRated(r.id, ratedBookingIds) ? (
                  <View style={styles.ratedBadge}>
                    <Text style={styles.ratedBadgeText}>{t('rateBookingScreen.alreadyRatedBadge')}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() =>
                      router.push(
                        `/(app)/rate-booking?bookingId=${encodeURIComponent(r.id)}&driverId=${encodeURIComponent(r.driver_id!)}`,
                      )
                    }
                    style={({ pressed }) => [styles.rateBtn, pressed && styles.rateBtnPressed]}
                  >
                    <Text style={styles.rateBtnText}>{t('historyPage.rate')}</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <CompanyBookingVoucherModal
        booking={voucherBooking}
        visible={!!voucherBooking}
        onClose={() => setVoucherBooking(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  filterStrip: {
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  kindFilterStrip: {
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipActive: {
    borderColor: FILTER_ACTIVE,
    backgroundColor: 'rgba(239, 159, 39, 0.15)',
  },
  filterText: {
    color: COLORS.grayLight,
    fontWeight: '600',
    fontSize: 13,
  },
  filterTextActive: {
    color: FILTER_ACTIVE,
    fontWeight: '700',
  },
  list: {
    flexGrow: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    color: COLORS.gray,
    fontSize: 14,
    marginBottom: SPACING.lg,
  },
  loading: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  errorBox: {
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
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  type: {
    color: COLORS.goldLight,
    fontSize: 13,
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  route: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    color: COLORS.gray,
    fontSize: 14,
  },
  price: {
    color: COLORS.gold,
    fontSize: 17,
    fontWeight: '800',
  },
  editBtn: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: COLORS.goldTint,
  },
  editBtnPressed: { opacity: 0.88 },
  editBtnText: {
    color: COLORS.goldDark,
    fontSize: 13,
    fontWeight: '700',
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
  rateBtn: {
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 166, 35, 0.18)',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  rateBtnPressed: {
    opacity: 0.88,
  },
  rateBtnText: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: 14,
  },
  ratedBadge: {
    marginTop: SPACING.md,
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
});
