import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  calendarDayKey,
  fetchVehicleCalendar,
  setVehicleDayBlocked,
  type VehicleDayStatus,
} from '../../lib/vehicleCalendar';
import { showErrorAlert } from '../../lib/validation';

/*
 * A host's calendar for one of his cars. He taps the whole days the car
 * cannot work (in the garage, lent out, ...); on those days the server offers
 * no job for it and lets nobody take one with it, so two bookings can never
 * meet on one car. Days the car already has a job are shown and cannot be
 * blocked. The host's own calendar (calendar.tsx) is a separate thing: it says
 * when he is busy, this one when the car is.
 */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The weeks of `cursor`'s month, Monday first, padded with nulls. */
function monthMatrix(cursor: Date): (Date | null)[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function VehicleCalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vehicleId?: string; name?: string }>();
  const vehicleId = typeof params.vehicleId === 'string' ? params.vehicleId : '';
  const vehicleName = typeof params.name === 'string' ? params.name : '';

  const [days, setDays] = useState<Record<string, VehicleDayStatus>>({});
  const [busyKeys, setBusyKeys] = useState<Record<string, true>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const monthRef = useRef(monthCursor);
  monthRef.current = monthCursor;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!vehicleId) {
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'initial') setLoading(true);
      const m = monthRef.current;
      const from = new Date(m.getFullYear(), m.getMonth(), 1);
      const to = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const res = await fetchVehicleCalendar(vehicleId, from, to);
      setLoading(false);
      setRefreshing(false);
      if (res.error) {
        showErrorAlert(res.error.message, t('vehicleCalendar.title'));
        return;
      }
      setDays(res.days);
    },
    [vehicleId, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstMonthRef = useRef(true);
  useEffect(() => {
    if (firstMonthRef.current) {
      firstMonthRef.current = false;
      return;
    }
    void load('silent');
  }, [monthCursor, load]);

  async function onTapDay(day: Date) {
    const key = calendarDayKey(day);
    if (busyKeys[key]) return;
    const state = days[key];
    if (state === 'booked') {
      showErrorAlert(t('vehicleCalendar.bookedDayHint'), t('vehicleCalendar.title'));
      return;
    }
    const block = state !== 'blocked';
    // Shown at once; put back if the server says no.
    setDays((prev) => {
      const next = { ...prev };
      if (block) next[key] = 'blocked';
      else delete next[key];
      return next;
    });
    setBusyKeys((prev) => ({ ...prev, [key]: true }));
    const res = await setVehicleDayBlocked(vehicleId, day, block);
    setBusyKeys((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (!res.ok) {
      setDays((prev) => {
        const next = { ...prev };
        if (block) delete next[key];
        else next[key] = 'blocked';
        return next;
      });
      const message = res.refusal
        ? t(`vehicleCalendar.errors.${res.refusal}`)
        : t('vehicleCalendar.errors.generic');
      showErrorAlert(message, t('vehicleCalendar.title'));
      if (res.refusal === 'vehicle_has_booking') void load('silent');
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/vehicles');
  }

  const today = startOfDay(new Date()).getTime();
  const months = t('calendarScreen.months').split(',');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 100 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={COLORS.gold} colors={[COLORS.gold]} />
      }
    >
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn} testID="vehicle-calendar-back">
        <Ionicons name="chevron-back" size={18} color={COLORS.gold} />
        <Text style={styles.backText}>{t('vehicleCalendar.back')}</Text>
      </Pressable>
      <Text style={styles.title}>{t('vehicleCalendar.title')}</Text>
      {vehicleName ? <Text style={styles.vehicleName}>{vehicleName}</Text> : null}
      <Text style={styles.subtitle}>{t('vehicleCalendar.subtitle')}</Text>

      <View style={styles.card} testID="vehicle-calendar">
        <View style={styles.monthHead}>
          <Pressable
            onPress={() => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            style={styles.monthNav}
            testID="vehicle-calendar-prev"
          >
            <Text style={styles.monthNavText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{`${months[monthCursor.getMonth()] ?? ''} ${monthCursor.getFullYear()}`}</Text>
          <Pressable
            onPress={() => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            style={styles.monthNav}
            testID="vehicle-calendar-next"
          >
            <Text style={styles.monthNavText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {t('calendarScreen.weekdays')
            .split(',')
            .map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.xl }} />
        ) : (
          <View style={styles.grid}>
            {monthMatrix(monthCursor).map((day, i) => {
              if (!day) return <View key={`b${i}`} style={styles.cell} />;
              const key = calendarDayKey(day);
              const past = day.getTime() < today;
              const state = days[key];
              return (
                <Pressable
                  key={key}
                  disabled={past || !!busyKeys[key]}
                  onPress={() => void onTapDay(day)}
                  style={[
                    styles.cell,
                    styles.cellDay,
                    state === 'blocked' && styles.cellBlocked,
                    state === 'booked' && styles.cellBooked,
                    past && styles.cellPast,
                  ]}
                  testID={`vehicle-calendar-day-${key}`}
                >
                  <Text
                    style={[
                      styles.cellText,
                      state === 'blocked' && styles.cellTextOn,
                      state === 'booked' && styles.cellTextBooked,
                      past && styles.cellTextPast,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.tapHint}>{t('vehicleCalendar.tapHint')}</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellBlocked]} />
            <Text style={styles.legendText}>{t('vehicleCalendar.legendBlocked')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellBooked]} />
            <Text style={styles.legendText}>{t('vehicleCalendar.legendBooked')}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  backText: { color: COLORS.gold, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xs },
  vehicleName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, lineHeight: 20, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  monthNav: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  monthNavText: { fontSize: 26, fontWeight: '700', color: COLORS.gold },
  monthTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: COLORS.textMuted, paddingBottom: SPACING.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellDay: { alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  cellTextOn: { color: COLORS.black },
  cellTextPast: { color: COLORS.textMuted },
  cellPast: { opacity: 0.4 },
  cellBlocked: { backgroundColor: COLORS.gold, borderRadius: RADIUS.md },
  // a job on the car: told apart from a day the host blocked at a glance
  cellBooked: { backgroundColor: COLORS.blueTint, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.blue },
  cellTextBooked: { color: COLORS.blue },
  tapHint: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 18 },
  legend: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14 },
  legendText: { fontSize: 12, color: COLORS.textSecondary },
});
