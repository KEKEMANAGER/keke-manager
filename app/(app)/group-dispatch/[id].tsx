import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { APP_HEADER_BODY_HEIGHT } from '../../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import {
  bookingStatusLabel,
  fetchBookingById,
  formatBookingDate,
  routeSummary,
  type BookingRow,
} from '../../../lib/bookings';
import { bookingOfferedPriceGel } from '../../../lib/bookingPrice';
import {
  assignDriverToLeg,
  broadcastOpenLegs,
  fetchLegsForMaster,
  summarizeLegs,
} from '../../../lib/groupBooking';
import { fetchMatchingDrivers, type MatchingDriver } from '../../../lib/drivers';
import { vehicleClassLabel, vehicleTypeLabel } from '../../../lib/vehicleCatalog';
import { showErrorAlert } from '../../../lib/validation';

export default function GroupDispatchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [master, setMaster] = useState<BookingRow | null>(null);
  const [legs, setLegs] = useState<BookingRow[]>([]);
  const [assignLegId, setAssignLegId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [busyLegId, setBusyLegId] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user?.id || !id) return;
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      const [{ data: masterRow, error: masterErr }, { data: legRows, error: legErr }] =
        await Promise.all([
          fetchBookingById(String(id), user.id),
          fetchLegsForMaster(String(id), user.id),
        ]);

      if (masterErr || !masterRow) {
        showErrorAlert(masterErr?.message ?? t('groupConvoy.masterNotFound'));
        router.back();
        return;
      }
      if (legErr) {
        showErrorAlert(legErr.message);
      }
      setMaster(masterRow);
      setLegs(legRows);
      setLoading(false);
      setRefreshing(false);
    },
    [id, router, t, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  const summary = summarizeLegs(legs);

  const openAssign = async (leg: BookingRow) => {
    setAssignLegId(leg.id);
    setDriversLoading(true);
    const { data } = await fetchMatchingDrivers(
      leg.vehicle_type ?? '',
      leg.vehicle_class ?? '',
      null,
      leg.from_location,
      'all',
      leg.passengers,
    );
    setDrivers(data);
    setDriversLoading(false);
  };

  const handleAssign = async (driverId: string) => {
    if (!user?.id || !assignLegId) return;
    setBusyLegId(assignLegId);
    const { error } = await assignDriverToLeg(assignLegId, user.id, driverId);
    setBusyLegId(null);
    setAssignLegId(null);
    if (error) {
      showErrorAlert(error.message);
      return;
    }
    void load('refresh');
  };

  const handleBroadcast = async () => {
    if (!user?.id || !id) return;
    setBroadcasting(true);
    const { count, error } = await broadcastOpenLegs(String(id), user.id);
    setBroadcasting(false);
    if (error) {
      showErrorAlert(error.message);
      return;
    }
    if (count === 0) {
      showErrorAlert(t('groupConvoy.noOpenLegs'));
    }
  };

  const padTop = insets.top + APP_HEADER_BODY_HEIGHT + 8;

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: padTop }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (!master) return null;

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: padTop, paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}
    >
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('groupConvoy.dispatchTitle')}</Text>
      <Text style={styles.hint}>{t('groupConvoy.dispatchHint')}</Text>
      {master.group_code ? (
        <Text style={styles.code}>{master.group_code}</Text>
      ) : null}
      <Text style={styles.route}>{routeSummary(master)}</Text>
      <Text style={styles.date}>{formatBookingDate(master)}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{master.passengers}</Text>
          <Text style={styles.statLabel}>{t('groupConvoy.totalPassengers')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{summary.totalLegs}</Text>
          <Text style={styles.statLabel}>{t('groupConvoy.vehicles')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{summary.assignedLegs}</Text>
          <Text style={styles.statLabel}>{t('groupConvoy.assigned')}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => void handleBroadcast()}
        disabled={broadcasting}
        style={[styles.broadcastBtn, broadcasting && styles.broadcastBtnDisabled]}
      >
        {broadcasting ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <>
            <Ionicons name="megaphone-outline" size={18} color={COLORS.white} />
            <Text style={styles.broadcastText}>{t('groupConvoy.broadcastOpen')}</Text>
          </>
        )}
      </Pressable>

      {summary.assignedLegs > 0 ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(app)/convoy-chat/[masterId]',
              params: { masterId: master.id },
            })
          }
          style={styles.convoyChatBtn}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={COLORS.goldDark} />
          <Text style={styles.convoyChatText}>{t('convoyChat.open')}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>{t('groupConvoy.legsList')}</Text>
      {legs.map((leg) => (
        <View key={leg.id} style={styles.legCard}>
          <View style={styles.legTop}>
            <Text style={styles.legTitle}>
              {t('groupConvoy.legTitle', { n: leg.leg_index ?? 0, pax: leg.passengers })}
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{bookingStatusLabel(leg.status)}</Text>
            </View>
          </View>
          <Text style={styles.legMeta}>
            {[vehicleTypeLabel(leg.vehicle_type ?? ''), vehicleClassLabel(leg.vehicle_class ?? '')]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.legPrice}>
            {t('groupConvoy.legPrice')}: {bookingOfferedPriceGel(leg).toLocaleString('ka-GE')} ₾
          </Text>
          <Text style={styles.legDriver}>
            {leg.driver_display_name
              ? t('groupConvoy.driverAssigned', { name: leg.driver_display_name })
              : t('groupConvoy.driverPending')}
          </Text>
          {leg.status === 'pending' && !leg.driver_id ? (
            <Pressable
              onPress={() => void openAssign(leg)}
              disabled={busyLegId === leg.id}
              style={styles.assignBtn}
            >
              {busyLegId === leg.id ? (
                <ActivityIndicator color={COLORS.goldDark} size="small" />
              ) : (
                <Text style={styles.assignBtnText}>{t('groupConvoy.assignDriver')}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ))}

      {assignLegId ? (
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{t('groupConvoy.pickDriver')}</Text>
          {driversLoading ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : drivers.length === 0 ? (
            <Text style={styles.empty}>{t('groupConvoy.noDrivers')}</Text>
          ) : (
            drivers.map((d) => (
              <Pressable key={d.id} onPress={() => void handleAssign(d.id)} style={styles.driverRow}>
                <Text style={styles.driverName}>{d.full_name ?? '—'}</Text>
                <Text style={styles.driverMeta}>{d.vehicle?.plate ?? ''}</Text>
              </Pressable>
            ))
          )}
          <Pressable onPress={() => setAssignLegId(null)} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { paddingHorizontal: SPACING.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  backText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  hint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  code: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },
  route: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm },
  date: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  broadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginBottom: SPACING.lg,
  },
  broadcastBtnDisabled: { opacity: 0.7 },
  broadcastText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  convoyChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    marginBottom: SPACING.lg,
  },
  convoyChatText: { color: COLORS.goldDark, fontWeight: '800', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: SPACING.md, color: COLORS.text },
  legCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  legTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statusPill: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  legMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
  legPrice: { fontSize: 14, fontWeight: '700', color: COLORS.goldDark, marginTop: 6 },
  legDriver: { fontSize: 14, color: COLORS.text, marginTop: 6 },
  assignBtn: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  assignBtnText: { color: COLORS.goldDark, fontWeight: '700' },
  modal: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOWS.card,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: SPACING.md },
  empty: { color: COLORS.textSecondary, marginBottom: SPACING.md },
  driverRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  driverName: { fontSize: 15, fontWeight: '600' },
  driverMeta: { fontSize: 12, color: COLORS.textSecondary },
  modalClose: { marginTop: SPACING.md, alignItems: 'center' },
  modalCloseText: { color: COLORS.textSecondary, fontWeight: '600' },
});
