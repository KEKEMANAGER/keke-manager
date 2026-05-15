import { useClerk, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BookingRow, BookingStatus } from '../../lib/bookings';
import {
  aggregateCompanyStats,
  bookingStatusLabel,
  bookingTypeLabel,
  fetchBookingsByCompanyId,
  formatBookingDate,
  routeSummary,
  subscribeBookingsChanges,
  unsubscribeChannel,
} from '../../lib/bookings';
import { BookingListSkeleton } from '../../components/BookingListSkeleton';
import { COLORS, SHADOWS, SPACING } from '../../constants/theme';
import type { DriverProfile } from '../../lib/drivers';
import { fetchDriverProfile } from '../../lib/drivers';
import { shareVoucherPDF } from '../../lib/voucher';

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function companyDisplayName(user: ReturnType<typeof useUser>['user']) {
  const raw = user?.unsafeMetadata;
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cn = m.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  return user?.firstName || 'კომპანია';
}

function statusStyle(status: BookingStatus) {
  if (status === 'pending') return styles.badgeLive;
  if (status === 'confirmed') return styles.badgeOk;
  if (status === 'rejected' || status === 'cancelled') return styles.badgeBad;
  return styles.badgeMuted;
}

function bookingCardStatusBorder(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return { borderLeftWidth: 3, borderLeftColor: '#F5A623' as const };
    case 'confirmed':
      return { borderLeftWidth: 3, borderLeftColor: '#1D9E75' as const };
    case 'completed':
      return { borderLeftWidth: 3, borderLeftColor: '#555566' as const };
    case 'rejected':
    case 'cancelled':
      return { borderLeftWidth: 3, borderLeftColor: '#E24B4A' as const };
    default:
      return { borderLeftWidth: 3, borderLeftColor: COLORS.border };
  }
}

export default function CompanyDashboardScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const name = companyDisplayName(user);
  const clerkId = user?.id;
  /** Clerk: unsafeMetadata e.g. `{ "role": "admin" }` or `{ "adminAccess": true }`. */
  const isClerkAdmin =
    user?.unsafeMetadata?.role === 'admin' || user?.unsafeMetadata?.adminAccess === true;

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [spent, setSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverModal, setDriverModal] = useState<BookingRow | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clerkId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const [bRes, sRes] = await Promise.all([
      fetchBookingsByCompanyId(clerkId),
      aggregateCompanyStats(clerkId),
    ]);
    setLoading(false);
    if (bRes.error) {
      setError(bRes.error.message);
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
  }, [clerkId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!clerkId) return;
    const ch = subscribeBookingsChanges((_payload) => {
      void load();
    });
    return () => unsubscribeChannel(ch);
  }, [clerkId, load]);

  function openWizard(preset: 'transfer' | 'tour' | 'dayTour') {
    router.push({
      pathname: '/(app)/new-booking',
      params: { preset },
    });
  }

  const activeBookings = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');

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

  async function onSignOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  async function openDriverModal(booking: BookingRow) {
    if (!booking.driver_id) return;
    setDriverModal(booking);
    setDriverProfile(null);
    setDriverLoading(true);
    const { data, error: profErr } = await fetchDriverProfile(booking.driver_id);
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
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.xl + 72 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>გამარჯობა,</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
        <View style={styles.headerRight}>
          {isClerkAdmin ? (
            <Pressable
              onPress={() => router.push('/(app)/admin-verify')}
              style={({ pressed }) => [styles.adminBtn, pressed && styles.adminBtnPressed]}
            >
              <Text style={styles.adminBtnText}>ადმინი</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void onSignOut()}
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutPressed]}
          >
            <Text style={styles.signOutText}>გამოსვლა</Text>
          </Pressable>
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeLabel}>ჯავშნები</Text>
            <Text style={styles.subBadgeTier}>{totalCount} სულ</Text>
            <Text style={styles.subBadgeUntil}>დასრულებული: {formatGel(spent)}</Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>ხელახლა</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>სწრაფი ჯავშანი</Text>
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => openWizard('transfer')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.gold, pressed && styles.pressed]}
        >
          <Text style={styles.quickEmoji}>🚗</Text>
          <Text style={styles.quickTitle}>ტრანსფერი</Text>
        </Pressable>
        <Pressable
          onPress={() => openWizard('tour')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.gold, pressed && styles.pressed]}
        >
          <Text style={styles.quickEmoji}>🗺️</Text>
          <Text style={styles.quickTitle}>ტური</Text>
        </Pressable>
        <Pressable
          onPress={() => openWizard('dayTour')}
          style={({ pressed }) => [styles.quickCard, SHADOWS.gold, pressed && styles.pressed]}
        >
          <Text style={styles.quickEmoji}>📅</Text>
          <Text style={styles.quickTitle}>ერთდღიანი</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>აქტიური ჯავშნები</Text>
        <Pressable onPress={() => router.push('/(app)/new-booking')}>
          <Text style={styles.link}>+ ახალი</Text>
        </Pressable>
      </View>

      <View style={styles.topStatsRow}>
        <View style={styles.topStatCard}>
          <Text style={styles.topStatValue}>{totalCount}</Text>
          <Text style={styles.topStatLabel}>ჯავშნები სულ</Text>
        </View>
        <View style={styles.topStatCard}>
          <Text style={styles.topStatValue}>{pendingCount}</Text>
          <Text style={styles.topStatLabel}>მოლოდინში</Text>
        </View>
        <View style={styles.topStatCard}>
          <Text style={styles.topStatValue}>{formatGel(spentThisMonth)}</Text>
          <Text style={styles.topStatLabel}>დახარჯული (თვე)</Text>
        </View>
      </View>

      {loading ? (
        <BookingListSkeleton variant="company" />
      ) : activeBookings.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>აქტიური ჯავშანი არ არის</Text>
        </View>
      ) : (
        activeBookings.map((b) => (
          <View key={b.id} style={[styles.bookingCard, bookingCardStatusBorder(b.status)]}>
            <View style={styles.bookingTop}>
              <Text style={styles.bookingType}>{bookingTypeLabel(b.kind)}</Text>
              <View style={[styles.statusPill, statusStyle(b.status)]}>
                <Text style={styles.statusText}>{bookingStatusLabel(b.status)}</Text>
              </View>
            </View>
            <Text style={styles.route}>{routeSummary(b)}</Text>
            <Text style={styles.date}>{formatBookingDate(b)}</Text>
            <View style={styles.driverBlock}>
              <Text style={styles.driverLabel}>მძღოლი</Text>
              {b.driver_display_name ? (
                <>
                  <Text style={styles.driverName}>{b.driver_display_name}</Text>
                  <Text style={styles.driverMeta}>
                    {[b.driver_phone, b.driver_plate, b.vehicle_class].filter(Boolean).join(' · ')}
                  </Text>
                </>
              ) : (
                <Text style={styles.driverPending}>ირჩევა მძღოლი…</Text>
              )}
              {b.status === 'confirmed' && b.driver_id ? (
                <Pressable onPress={() => void openDriverModal(b)} style={styles.driverBtn}>
                  <Text style={styles.driverBtnText}>👤 მძღოლი</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.price}>{formatGel(Number(b.price_gel))}</Text>
            <Pressable onPress={() => void shareVoucherPDF(b)} style={styles.voucherBtn}>
              <Text style={styles.voucherBtnText}>📄 ვაუჩერი</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>სტატისტიკა</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalCount}</Text>
          <Text style={styles.statLabel}>ჯავშნები სულ</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatGel(spent)}</Text>
          <Text style={styles.statLabel}>დახარჯული (დასრულებული)</Text>
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
                {driverProfile.vehicle?.photo_front ? (
                  <Image
                    source={{ uri: driverProfile.vehicle.photo_front }}
                    style={styles.vehiclePhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.vehiclePhotoPlaceholder}>
                    <Text style={{ fontSize: 48 }}>🚗</Text>
                  </View>
                )}

                {driverProfile.vehicle ? (
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleTitle}>
                      {[driverProfile.vehicle.model, driverProfile.vehicle.year, driverProfile.vehicle.color]
                        .filter((x) => x !== null && x !== undefined && x !== '')
                        .join(' • ')}
                    </Text>
                    <View style={styles.chipRow}>
                      {driverProfile.vehicle.type ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>{driverProfile.vehicle.type}</Text>
                        </View>
                      ) : null}
                      {driverProfile.vehicle.class ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>{driverProfile.vehicle.class}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.driverInfo}>
                  {driverProfile.avatar_url ? (
                    <Image source={{ uri: driverProfile.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={{ color: COLORS.gold, fontWeight: '800' }}>
                        {(driverProfile.full_name || driverModal?.driver_display_name || '?')[0]}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverNameModal}>
                      {driverProfile.full_name || driverModal?.driver_display_name || 'მძღოლი'}
                    </Text>
                    <Text style={styles.ratingText}>
                      ⭐{' '}
                      {driverProfile.rating.count > 0
                        ? `${driverProfile.rating.average.toFixed(1)} (${driverProfile.rating.count} შეფასება)`
                        : '— (შეფასება არ არის)'}
                    </Text>
                  </View>
                </View>

                {driverProfile.experience_years != null && driverProfile.experience_years > 0 ? (
                  <Text style={styles.infoText}>🕐 {driverProfile.experience_years} წლის გამოცდილება</Text>
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
            ) : (
              <Text style={styles.modalEmptyText}>მძღოლის ინფო ვერ მოიძებნა</Text>
            )}
          </ScrollView>

          <Pressable
            onPress={() => {
              setDriverModal(null);
              setDriverProfile(null);
            }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>დახურვა</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
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
    color: COLORS.grayLight,
    fontSize: 15,
  },
  name: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  subBadge: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
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
  sectionTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  topStatsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  topStatCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  topStatValue: {
    color: COLORS.gold,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  topStatLabel: {
    color: COLORS.gray,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
  },
  link: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  quickCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  quickEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  quickTitle: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
  emptyBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.gray,
    fontSize: 15,
  },
  bookingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
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
  badgeLive: {
    backgroundColor: 'rgba(245,166,35,0.2)',
  },
  badgeOk: {
    backgroundColor: 'rgba(76,175,80,0.2)',
  },
  badgeBad: {
    backgroundColor: 'rgba(244,67,54,0.2)',
  },
  badgeMuted: {
    backgroundColor: COLORS.border,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  route: {
    color: COLORS.white,
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
  driverName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
  driverMeta: {
    color: COLORS.grayLight,
    fontSize: 13,
    marginTop: 4,
  },
  driverPending: {
    color: COLORS.gray,
    fontSize: 14,
    fontStyle: 'italic',
  },
  driverBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  driverBtnText: {
    color: COLORS.grayLight,
    fontSize: 13,
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
  vehiclePhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  vehiclePhotoPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  vehicleInfo: {
    marginBottom: SPACING.md,
  },
  vehicleTitle: {
    color: COLORS.white,
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
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNameModal: {
    color: COLORS.white,
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
