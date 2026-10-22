import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  parseStoredDateTime,
} from '../../lib/dateTime';
import {
  createManualDriverSchedule,
  deleteManualDriverSchedule,
  fetchDriverSchedules,
  type DriverScheduleRow,
} from '../../lib/driverSchedules';

/*
 * Drivers asked for this in the group: "change the calendar so we can mark the
 * days we are busy." The blocking itself already worked — what the screen
 * showed was two date-time pickers and a list of hour ranges, which is a form,
 * not a calendar. A driver who is away on a three-day tour wants to tap three
 * days. So the month is drawn, a tap takes the whole day, and the hour-level
 * form stays underneath for the half-day cases.
 */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** The weeks of `cursor`'s month, Monday first, padded with nulls. */
function monthMatrix(cursor: Date): (Date | null)[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // JS weeks start Sunday; ours start Monday
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function DriverCalendarScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id ?? '';

  const [blocks, setBlocks] = useState<DriverScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  /** What a square shows: a booking the driver took, a day he blocked, or free. */
  function dayState(day: Date): { kind: 'free' | 'busy' | 'booking'; manual: DriverScheduleRow | null } {
    const from = startOfDay(day).getTime();
    const to = endOfDay(day).getTime();
    let manual: DriverScheduleRow | null = null;
    for (const row of blocks) {
      const start = parseStoredDateTime(row.start_time)?.getTime();
      const end = parseStoredDateTime(row.end_time)?.getTime();
      if (start == null || end == null) continue;
      if (start > to || end < from) continue;
      if (row.source === 'booking') return { kind: 'booking', manual: null };
      // A square is only "taken" when the block covers the day end to end;
      // an hour or two leaves the day free to be offered.
      if (start <= from && end >= to) manual = row;
    }
    return manual ? { kind: 'busy', manual } : { kind: 'free', manual: null };
  }

  async function onToggleDay(day: Date) {
    if (!userId || saving) return;
    const state = dayState(day);
    if (state.kind === 'booking') {
      Alert.alert(t('calendarScreen.title'), t('calendarScreen.bookingDayHint'));
      return;
    }
    setSaving(true);
    const res = state.manual
      ? await deleteManualDriverSchedule(state.manual.id, userId)
      : await createManualDriverSchedule(userId, { start: startOfDay(day), end: endOfDay(day) });
    setSaving(false);
    if (!res.ok) {
      Alert.alert(t('system.errorTitle'), res.error?.message ?? t('calendarScreen.saveFailed'));
      return;
    }
    void load();
  }

  function scheduleTitle(row: DriverScheduleRow): string {
    if (row.source === 'booking') return t('calendarScreen.booking');
    return t('calendarScreen.busyLabel');
  }

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!userId) {
      setBlocks([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 60);
    const { data, error } = await fetchDriverSchedules(userId, from, to);
    setLoading(false);
    setRefreshing(false);
    if (error) {
      Alert.alert(t('system.errorTitle'), error.message);
      setBlocks([]);
      return;
    }
    setBlocks(data);
  }, [userId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );


  function onDeleteBlock(row: DriverScheduleRow) {
    if (row.source !== 'manual' || !userId) return;
    Alert.alert(t('calendarScreen.deleteTitle'), t('calendarScreen.deleteConfirm'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('calendarScreen.deleteTitle'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteManualDriverSchedule(row.id, userId);
            if (!res.ok) {
              Alert.alert(
                t('system.errorTitle'),
                res.error?.message ?? t('calendarScreen.deleteFailed'),
              );
              return;
            }
            void load();
          })();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 100 },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={COLORS.gold}
          colors={[COLORS.gold]}
        />
      }
    >
      <Text style={styles.title}>{t('calendarScreen.title')}</Text>
      <Text style={styles.subtitle}>{t('calendarScreen.subtitle')}</Text>

      <View style={styles.card}>
        <View style={styles.monthHead}>
          <Pressable
            onPress={() =>
              setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
            }
            style={styles.monthNav}
          >
            <Text style={styles.monthNavText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>
            {`${t('calendarScreen.months').split(',')[monthCursor.getMonth()] ?? ''} ${monthCursor.getFullYear()}`}
          </Text>
          <Pressable
            onPress={() =>
              setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
            }
            style={styles.monthNav}
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

        <View style={styles.grid}>
          {monthMatrix(monthCursor).map((day, i) => {
            if (!day) return <View key={`b${i}`} style={styles.cell} />;
            const past = endOfDay(day).getTime() < Date.now();
            const state = dayState(day);
            return (
              <Pressable
                key={day.toISOString()}
                disabled={past || saving}
                onPress={() => void onToggleDay(day)}
                style={[
                  styles.cell,
                  styles.cellDay,
                  state.kind === 'busy' && styles.cellBusy,
                  state.kind === 'booking' && styles.cellBooking,
                  past && styles.cellPast,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    (state.kind === 'busy' || state.kind === 'booking') && styles.cellTextOn,
                    past && styles.cellTextPast,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.tapHint}>{t('calendarScreen.tapHint')}</Text>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellBusy]} />
            <Text style={styles.legendText}>{t('calendarScreen.legendBusy')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.cellBooking]} />
            <Text style={styles.legendText}>{t('calendarScreen.legendBooking')}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('calendarScreen.myBusyDays')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.lg }} />
      ) : blocks.length === 0 ? (
        <Text style={styles.empty}>{t('calendarScreen.empty')}</Text>
      ) : (
        blocks.map((row) => {
          const start = parseStoredDateTime(row.start_time);
          const end = parseStoredDateTime(row.end_time);
          // A day the driver blocked runs 00:00 to 23:59, and printing those
          // two numbers back at him is exactly the hour-counting he asked us
          // to take away. Whole days read as dates; a booking keeps its hours,
          // because for a booking the hour is the point.
          const wholeDays =
            !!start &&
            !!end &&
            start.getHours() === 0 &&
            start.getMinutes() === 0 &&
            end.getHours() === 23 &&
            end.getMinutes() === 59;
          const sameDate = !!start && !!end && start.toDateString() === end.toDateString();
          const range = !start || !end
            ? '—'
            : wholeDays
              ? (sameDate
                  ? formatDisplayDate(start)
                  : `${formatDisplayDate(start)} — ${formatDisplayDate(end)}`)
              : `${formatDisplayDateTime(start)} — ${formatDisplayDateTime(end)}`;
          return (
            <View key={row.id} style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockTitle}>{scheduleTitle(row)}</Text>
                <View
                  style={[
                    styles.badge,
                    row.source === 'booking' ? styles.badgeBooking : styles.badgeManual,
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {row.source === 'booking'
                      ? t('calendarScreen.booking')
                      : t('calendarScreen.manual')}
                  </Text>
                </View>
              </View>
              <Text style={styles.blockRange}>{range}</Text>
              {row.source === 'manual' ? (
                <Pressable
                  onPress={() => onDeleteBlock(row)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.deleteBtnText}>{t('calendarScreen.delete')}</Text>
                </Pressable>
              ) : (
                <Text style={styles.blockHint}>{t('calendarScreen.bookingHint')}</Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  monthNav: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  monthNavText: { fontSize: 26, fontWeight: '700', color: COLORS.gold },
  monthTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    paddingBottom: SPACING.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellDay: { alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  cellTextOn: { color: COLORS.black },
  cellTextPast: { color: COLORS.textMuted },
  cellPast: { opacity: 0.4 },
  cellBusy: { backgroundColor: COLORS.gold, borderRadius: RADIUS.md },
  cellBooking: { backgroundColor: COLORS.goldLight, borderRadius: RADIUS.md },
  tapHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 18,
  },
  legend: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14 },
  legendText: { fontSize: 12, color: COLORS.textSecondary },
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  primaryBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontWeight: '800',
    fontSize: 15,
    color: COLORS.black,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  empty: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  blockCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeManual: {
    backgroundColor: COLORS.goldTint,
  },
  badgeBooking: {
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  blockRange: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  blockHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  deleteBtnText: {
    color: COLORS.error,
    fontWeight: '700',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.88,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
