import type { User } from '@supabase/supabase-js';
import { useLocalSearchParams } from 'expo-router';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { BookingRealtimeRecord, BookingRow, BookingStatus } from '../../lib/bookings';
import {
  acceptBooking,
  bookingStatusLabel,
  completeBooking,
  fetchBookingsForDriver,
  fetchOpenPendingBookingsForDriver,
  formatBookingDate,
  isNewOpenPendingBookingInsert,
  rejectBooking,
  routeSummary,
  startBookingTrip,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { notifyNewOpenBookingIfMatchesDriver } from '../../lib/localNotifications';

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

type BookingTabKey = 'open' | 'active' | 'completed';

const TABS: { key: BookingTabKey; label: string }[] = [
  { key: 'open', label: 'მოლოდინში' },
  { key: 'active', label: 'მიმდინარე' },
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
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
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

    const results = await Promise.all([
      fetchOpenPendingBookingsForDriver(userId),
      fetchBookingsForDriver(userId),
    ]);
    const openRes = results[0]!;
    const mineRes = results[1]!;

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
    if (mineRes.error) {
      if (!openRes.error) setError(mineRes.error.message);
      setAssigned([]);
    } else {
      setAssigned(mineRes.data);
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
      void load('silent');
      return;
    }
    void load('silent');
    setTab('active');
  }

  async function handleReject(item: BookingRow) {
    setActingId(item.id);
    const res = await rejectBooking(item.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'უარყოფა ვერ მოხერხდა');
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
    const res = await completeBooking(item.id, user.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'დასრულება ვერ მოხერხდა');
      void load('silent');
      return;
    }
    void load('silent');
    setTab('completed');
  }

  async function onStartTrip(item: BookingRow) {
    if (!user?.id) return;
    setActingId(item.id);
    const res = await startBookingTrip(item.id, user.id);
    setActingId(null);
    if (!res.ok) {
      crossInfoAlert('შეცდომა', res.error?.message || 'დაწყება ვერ მოხერხდა');
      void load('silent');
      return;
    }
    void load('silent');
  }

  const emptyForTab = useMemo(() => {
    switch (tab) {
      case 'open':
        if (openListHint === 'profile_vehicle_required') {
          return {
            icon: 'calendar' as const,
            title: 'პროფილში მიუთითეთ ავტომობილი',
            subtitle:
              'პროფილში შეინახეთ მანქანის ტიპი და კლასი; სანამ ეს ცარიელია — არც შეკვეთები გამოჩნდება აქ და არც მოგივათ შესაბამისი შეტყობინებები.',
          };
        }
        return {
          icon: 'calendar' as const,
          title: 'ჯავშნები ჯერ არ გაქვთ',
          subtitle:
            'ახალი შეკვეთები ჩანს ტაბში „მოლოდინში“. თუ კომპანიამ გამოგიგზავნათ შეკვეთა, ჩამოწიეთ ეკრანი განახლებისთვის ან შეამოწმეთ რომ პროფილის ტიპი/კლასი ემთხვევა შეკვეთას.',
        };
      case 'active':
        return {
          icon: 'calendar' as const,
          title: 'მიმდინარე ჯავშანი არაა',
          subtitle:
            'ჯავშნის მიღების შემდეგ აქ გამოჩნდება რეისები — ჯერ დააჭირეთ „დავიწყე შესრულება", შემდეგ „დასრულება".',
        };
      default:
        return {
          icon: 'archive' as const,
          title: 'დასრულებული რეისები არ გაქვთ',
          subtitle:
            'დასრულებული ჯავშნები აქ შეინახება ისტორიისთვის.',
        };
    }
  }, [tab, openListHint]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
      <Text style={styles.title}>ჯავშანები</Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retryBtn}>
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
            { paddingBottom: insets.bottom + SPACING.xl + 72 },
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
              <Text style={styles.company}>{item.company_name || 'კომპანია'}</Text>
              {item.created_by_name?.trim() ? (
                <Text style={styles.operator}>
                  ოპერატორი: {item.created_by_name.trim()}
                </Text>
              ) : null}
              <Text style={styles.date}>{formatBookingDate(item)}</Text>
              <Text style={styles.route}>{routeSummary(item)}</Text>
              <View style={styles.footer}>
                <Text style={styles.price}>{Number(item.price_gel).toLocaleString('ka-GE')} ₾</Text>
                {tab === 'open' ? (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          crossAlert(
                            'შეკვეთის გაუქმება',
                            'ნამდვილად გსურთ შეკვეთის გაუქმება?',
                            () => void handleReject(item),
                            'უარყოფა',
                          );
                          return;
                        }
                        Alert.alert('შეკვეთის გაუქმება', 'ნამდვილად გსურთ შეკვეთის გაუქმება?', [
                          { text: 'არა', style: 'cancel' },
                          { text: 'უარყოფა', style: 'destructive', onPress: () => void handleReject(item) },
                        ]);
                      }}
                      disabled={actingId === item.id}
                      style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
                    >
                      {actingId === item.id ? (
                        <ActivityIndicator color={COLORS.grayLight} size="small" />
                      ) : (
                        <Text style={styles.btnGhostText}>უარყოფა</Text>
                      )}
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
                        <ActivityIndicator color={COLORS.white} size="small" />
                      ) : (
                        <Text style={styles.btnGoldText}>მიღება</Text>
                      )}
                    </Pressable>
                  </View>
                ) : tab === 'active' ? (
                  <View style={styles.actions}>
                    {item.status === 'accepted' ? (
                      <Pressable
                        onPress={() => void onStartTrip(item)}
                        disabled={actingId === item.id}
                        style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
                      >
                        {actingId === item.id ? (
                          <ActivityIndicator color={COLORS.white} size="small" />
                        ) : (
                          <Text style={styles.btnGoldText}>დავიწყე შესრულება</Text>
                        )}
                      </Pressable>
                    ) : item.status === 'in_progress' ? (
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
                          <ActivityIndicator color={COLORS.white} size="small" />
                        ) : (
                          <Text style={styles.btnGoldText}>დასრულება</Text>
                        )}
                      </Pressable>
                    ) : null}
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
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
