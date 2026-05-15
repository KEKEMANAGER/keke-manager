import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

type FilterKey = 'ყველა' | 'მიმდინარე' | 'დადასტურებული' | 'დასრულებული' | 'გაუქმებული';

const FILTERS: FilterKey[] = [
  'ყველა',
  'მიმდინარე',
  'დადასტურებული',
  'დასრულებული',
  'გაუქმებული',
];

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function statusColor(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return COLORS.gold;
    case 'confirmed':
      return COLORS.success;
    case 'completed':
      return '#3B82F6';
    case 'rejected':
    case 'cancelled':
      return COLORS.error;
    default:
      return COLORS.gray;
  }
}

function matchesFilter(row: BookingRow, filter: FilterKey): boolean {
  if (filter === 'ყველა') return true;
  if (filter === 'მიმდინარე') return row.status === 'pending';
  if (filter === 'დადასტურებული') return row.status === 'confirmed';
  if (filter === 'დასრულებული') return row.status === 'completed';
  if (filter === 'გაუქმებული') return row.status === 'rejected' || row.status === 'cancelled';
  return true;
}

export default function CompanyHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [filter, setFilter] = useState<FilterKey>('ყველა');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchBookingsByCompanyId(userId);
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeBookingsChanges((_payload) => {
      void load();
    });
    return () => unsubscribeChannel(ch);
  }, [userId, load]);

  const filtered = useMemo(() => rows.filter((r) => matchesFilter(r, filter)), [rows, filter]);

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
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
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
      >
        <Text style={styles.title}>ჯავშნების ისტორია</Text>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>ხელახლა</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sub}>
          ნაჩვენებია {filtered.length} ჩანაწერი
          {filter !== 'ყველა' ? ` · ფილტრი: ${filter}` : ''}
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.gold} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>ჩანაწერები არ მოიძებნა</Text>
          </View>
        ) : (
          filtered.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.type}>{bookingTypeLabel(r.kind)}</Text>
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
                <Text style={styles.voucherBtnText}>📄 ვაუჩერი</Text>
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
                  <Text style={styles.rateBtnText}>შეფასება</Text>
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
  empty: {
    paddingVertical: SPACING.xl * 2,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.gray,
    fontSize: 16,
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
