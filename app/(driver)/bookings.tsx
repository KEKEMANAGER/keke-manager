import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingListSkeleton } from '../../components/BookingListSkeleton';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { BookingRow } from '../../lib/bookings';
import {
  acceptBooking,
  completeBooking,
  fetchBookingsForDriver,
  fetchOpenPendingBookings,
  formatBookingDate,
  isNewOpenPendingBookingInsert,
  rejectBooking,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { notifyNewOpenBooking } from '../../lib/localNotifications';

function crossAlert(title: string, message: string, onConfirm: () => void, confirmText = 'დიახ') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'გაუქმება', style: 'cancel' },
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

type BookingTabKey = 'pending' | 'confirmed' | 'completed';

const TABS: { key: BookingTabKey; label: string }[] = [
  { key: 'pending', label: 'მოლოდინში' },
  { key: 'confirmed', label: 'დადასტურებული' },
  { key: 'completed', label: 'დასრულებული' },
];

function driverDisplayName(user: User | null, profile: Profile | null) {
  const full = profile?.full_name?.trim();
  if (full) return full;
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const nm = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (nm) return nm;
  return user?.email?.split('@')[0] || 'მძღოლი';
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

export default function DriverBookingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const userId = user?.id;

  const [tab, setTab] = useState<BookingTabKey>('pending');
  const [openJobs, setOpenJobs] = useState<BookingRow[]>([]);
  const [assigned, setAssigned] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setOpenJobs([]);
      setAssigned([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const [openRes, mineRes] = await Promise.all([
      fetchOpenPendingBookings(),
      fetchBookingsForDriver(userId),
    ]);
    setLoading(false);
    if (openRes.error) {
      setError(openRes.error.message);
      setOpenJobs([]);
    } else {
      setOpenJobs(openRes.data);
    }
    if (mineRes.error) {
      if (!openRes.error) setError(mineRes.error.message);
      setAssigned([]);
    } else {
      setAssigned(mineRes.data);
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

  const data = useMemo(() => {
    if (tab === 'pending') return openJobs;
    if (tab === 'confirmed') return assigned.filter((b) => b.status === 'confirmed');
    return assigned.filter((b) => b.status === 'completed');
  }, [tab, openJobs, assigned]);

  async function onAccept(item: BookingRow) {
    if (!user) return;
    setActingId(item.id);
    const res = await acceptBooking(item.id, {
      clerkId: user.id,
      displayName: driverDisplayName(user, profile),
      phone: driverPhone(user, profile),
      plate: driverPlateFromMeta(user),
    });
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'დადასტურება ვერ მოხერხდა');
      void load();
      return;
    }
    void load();
    setTab('confirmed');
  }

  async function onReject(item: BookingRow) {
    setActingId(item.id);
    const res = await rejectBooking(item.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'უარყოფა ვერ მოხერხდა');
    }
    void load();
  }

  async function onComplete(item: BookingRow) {
    setActingId(item.id);
    const res = await completeBooking(item.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'დასრულება ვერ მოხერხდა');
      void load();
      return;
    }
    void load();
    setTab('completed');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
      <Text style={styles.title}>ჯავშანები</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>ხელახლა</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerLoad}>
          <BookingListSkeleton variant="driver" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + SPACING.xl + 72 },
          ]}
          ListEmptyComponent={
            <Text style={styles.empty}>ამ სტატუსში ჯავშანი არ არის</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.company}>{item.company_name || 'კომპანია'}</Text>
              <Text style={styles.date}>{formatBookingDate(item)}</Text>
              <Text style={styles.route}>{routeSummary(item)}</Text>
              <View style={styles.footer}>
                <Text style={styles.price}>{Number(item.price_gel).toLocaleString('ka-GE')} ₾</Text>
                {tab === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() =>
                        crossAlert('უარყოფა', `უარყოთ ჯავშანი?`, () => void onReject(item), 'უარყოფა')
                      }
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
                    >
                      <Text style={styles.btnGhostText}>უარყოფა</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        crossAlert(
                          'დადასტურება',
                          `მიიღოთ ჯავშანი?`,
                          () => void onAccept(item),
                          'მიღება',
                        )
                      }
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color="#000000" size="small" />
                      ) : (
                        <Text style={styles.btnGoldText}>მიღება</Text>
                      )}
                    </Pressable>
                  </View>
                ) : tab === 'confirmed' ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() =>
                        crossAlert(
                          'დასრულება',
                          'დაასრულოთ ჯავშანი?',
                          () => void onComplete(item),
                          'დასრულება',
                        )
                      }
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color="#000000" size="small" />
                      ) : (
                        <Text style={styles.btnGoldText}>დასრულება</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  empty: {
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontSize: 15,
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
  company: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
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
    marginBottom: SPACING.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
