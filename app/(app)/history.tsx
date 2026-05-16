import { useRouter } from 'expo-router';
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
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import type { BookingRow, BookingStatus } from '../../lib/bookings';
import {
  bookingStatusLabel,
  bookingTypeLabel,
  fetchBookingsByCompanyId,
  formatBookingDate,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { shareVoucherPDF } from '../../lib/voucher';
import { useAuth } from '../../contexts/AuthContext';

type FilterKey = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';

const FILTERS: FilterKey[] = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

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

  const [filter, setFilter] = useState<FilterKey>('all');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const { data, error: err } = await fetchBookingsByCompanyId(userId);

    if (mode === 'initial') setLoading(false);
    if (mode === 'refresh') setRefreshing(false);

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data);
    }
  }, [userId]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((_payload) => {
      void load('silent');
    });
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  const filtered = useMemo(() => rows.filter((r) => matchesFilter(r, filter)), [rows, filter]);

  function historyEmptyMessages(f: FilterKey): {
    icon: 'calendar' | 'archive' | 'clock';
    title: string;
    subtitle: string;
  } {
    switch (f) {
      case 'pending':
        return {
          icon: 'clock',
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
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.filterStrip,
          { paddingLeft: SPACING.lg, paddingTop: insets.top + SPACING.sm },
        ]}
        style={styles.filterScroll}
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
          {filter !== 'all' ? t('historyPage.filterActive', { filter: filterLabels[filter] }) : ''}
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
              <Pressable onPress={() => void shareVoucherPDF(r)} style={styles.voucherBtn}>
                <Text style={styles.voucherBtnText}>📄 {t('historyPage.voucher')}</Text>
              </Pressable>
              {/* rate-booking: bookingId = booking.id (uuid), driverClerkId = driver (text). Query URL + rate-booking normalizer handle Expo web param order. */}
              {r.status === 'completed' && r.driver_id ? (
                <Pressable
                  onPress={() => {
                    const booking = r;
                    const driverId = booking.driver_id;
                    if (!driverId) return;
                    // Query string avoids web/Expo Router param mix-ups vs object `params`.
                    router.push(
                      `/(app)/rate-booking?bookingId=${encodeURIComponent(booking.id)}&driverClerkId=${encodeURIComponent(driverId)}`,
                    );
                  }}
                  style={({ pressed }) => [styles.rateBtn, pressed && styles.rateBtnPressed]}
                >
                  <Text style={styles.rateBtnText}>{t('historyPage.rate')}</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  filterScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterStrip: {
    paddingRight: SPACING.lg,
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
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.12)',
  },
  filterText: {
    color: COLORS.grayLight,
    fontWeight: '600',
    fontSize: 13,
  },
  filterTextActive: {
    color: COLORS.gold,
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
});
