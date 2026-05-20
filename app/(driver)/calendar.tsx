import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DateTimeField } from '../../components/DateTimeField';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDateTime, parseStoredDateTime } from '../../lib/dateTime';
import {
  createManualDriverSchedule,
  deleteManualDriverSchedule,
  fetchDriverSchedules,
  type DriverScheduleRow,
} from '../../lib/driverSchedules';

export default function DriverCalendarScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = user?.id ?? '';

  const [blocks, setBlocks] = useState<DriverScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyStart, setBusyStart] = useState<Date | null>(null);
  const [busyEnd, setBusyEnd] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  function scheduleTitle(row: DriverScheduleRow): string {
    if (row.source === 'booking') return t('calendarScreen.booking');
    return t('calendarScreen.busyLabel');
  }

  const load = useCallback(async () => {
    if (!userId) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 60);
    const { data, error } = await fetchDriverSchedules(userId, from, to);
    setLoading(false);
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

  async function onAddBusyBlock() {
    if (!userId) return;
    if (!busyStart || !busyEnd) {
      Alert.alert(t('validation.alertTitle'), t('calendarScreen.fillDates'));
      return;
    }
    if (busyEnd.getTime() <= busyStart.getTime()) {
      Alert.alert(t('validation.alertTitle'), t('calendarScreen.endAfterStart'));
      return;
    }
    setSaving(true);
    const res = await createManualDriverSchedule(userId, { start: busyStart, end: busyEnd });
    setSaving(false);
    if (!res.ok) {
      Alert.alert(t('system.errorTitle'), res.error?.message ?? t('calendarScreen.saveFailed'));
      return;
    }
    setBusyStart(null);
    setBusyEnd(null);
    void load();
  }

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
    >
      <Text style={styles.title}>{t('calendarScreen.title')}</Text>
      <Text style={styles.subtitle}>{t('calendarScreen.subtitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('calendarScreen.newBusy')}</Text>
        <DateTimeField
          label={t('calendarScreen.start')}
          value={busyStart}
          onChange={setBusyStart}
          minimumDate={new Date()}
        />
        <DateTimeField
          label={t('calendarScreen.end')}
          value={busyEnd}
          onChange={setBusyEnd}
          minimumDate={busyStart ?? new Date()}
        />
        <Pressable
          onPress={() => void onAddBusyBlock()}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || saving) && styles.pressed,
            saving && styles.btnDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <Text style={styles.primaryBtnText}>{t('calendarScreen.imBusy')}</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t('calendarScreen.myBusyHours')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.lg }} />
      ) : blocks.length === 0 ? (
        <Text style={styles.empty}>{t('calendarScreen.empty')}</Text>
      ) : (
        blocks.map((row) => {
          const start = parseStoredDateTime(row.start_time);
          const end = parseStoredDateTime(row.end_time);
          const range =
            start && end
              ? `${formatDisplayDateTime(start)} — ${formatDisplayDateTime(end)}`
              : '—';
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
