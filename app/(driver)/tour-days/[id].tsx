import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchBookingById, routeSummary, type BookingRow } from '../../../lib/bookings';
import {
  captureTourDayOdometer,
  closeTourDay,
  completeTourBooking,
  fetchTourDayPlan,
  type TourDayProgress,
  type TourDayRow,
} from '../../../lib/tourDayLogs';

/**
 * Day-by-day close-out for a multi-day tour.
 *
 * The driver closes each day as it ends — odometer, where he slept, what he
 * spent — and the tour can only be finished once every day is closed. The order
 * and the timing are enforced on the server, so this screen shows the rules
 * rather than implementing them.
 */
export default function TourDaysScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = String(id ?? '').trim();

  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [progress, setProgress] = useState<TourDayProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [odometer, setOdometer] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [overnight, setOvernight] = useState('');
  const [costs, setCosts] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!bookingId) {
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);

      const [{ data: row }, { data: plan, error }] = await Promise.all([
        fetchBookingById(bookingId),
        fetchTourDayPlan(bookingId),
      ]);

      setLoading(false);
      setRefreshing(false);
      if (row) setBooking(row);
      if (error) {
        Alert.alert(t('common.error'), error.message);
        return;
      }
      setProgress(plan);
    },
    [bookingId, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setOdometer('');
    setPhotoUrl(null);
    setOvernight('');
    setCosts('');
    setNote('');
  }

  function startClosing(day: TourDayRow) {
    setOpenDay(day.dayIndex);
    setOdometer(day.odometerValue != null ? String(day.odometerValue) : '');
    setPhotoUrl(day.odometerPhotoUrl);
    setOvernight(day.overnightPlace ?? day.plannedOvernight ?? '');
    setCosts(day.extraCostsGel != null ? String(day.extraCostsGel) : '');
    setNote(day.note ?? '');
  }

  async function onTakePhoto(dayIndex: number) {
    if (!user?.id) return;
    const res = await captureTourDayOdometer(bookingId, user.id, dayIndex);
    if (!res.ok) {
      if (res.cancelled) return;
      Alert.alert(t('common.error'), res.error?.message ?? t('common.error'));
      return;
    }
    setPhotoUrl(res.url);
  }

  function parseAmount(value: string): number | null {
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function onCloseDay(dayIndex: number) {
    if (saving) return;
    const odoRaw = odometer.trim();
    const odo = parseAmount(odoRaw);
    if (odoRaw && odo === null) {
      Alert.alert(t('common.error'), t('tourDays.odometerInvalid'));
      return;
    }
    const costsRaw = costs.trim();
    const cost = parseAmount(costsRaw);
    if (costsRaw && cost === null) {
      Alert.alert(t('common.error'), t('tourDays.costsInvalid'));
      return;
    }

    setSaving(true);
    const { result, error } = await closeTourDay(bookingId, dayIndex, {
      odometerValue: odo,
      odometerPhotoUrl: photoUrl,
      overnightPlace: overnight.trim() || null,
      extraCostsGel: cost,
      note: note.trim() || null,
    });
    setSaving(false);

    if (error || !result) {
      Alert.alert(t('common.error'), error?.message ?? t('tourDays.closeFailed'));
      return;
    }
    if (!result.ok) {
      Alert.alert(t('common.error'), result.message || t('tourDays.closeFailed'));
      void load('refresh');
      return;
    }

    setOpenDay(null);
    resetForm();
    await load('refresh');

    if (result.allClosed) {
      Alert.alert(t('tourDays.allClosedTitle'), t('tourDays.allClosedBody'));
    }
  }

  async function onFinishTour() {
    if (finishing) return;
    setFinishing(true);
    const res = await completeTourBooking(bookingId);
    setFinishing(false);

    if (!res.ok) {
      Alert.alert(t('common.error'), res.error.message);
      void load('refresh');
      return;
    }

    const s = res.summary;
    const lines = [
      t('tourDays.summaryDays', { count: s.totalDays }),
      s.odometerKm != null ? t('tourDays.summaryKm', { km: s.odometerKm }) : null,
      s.extraCostsGel > 0 ? t('tourDays.summaryCosts', { amount: s.extraCostsGel }) : null,
    ].filter(Boolean);

    Alert.alert(t('tourDays.finishedTitle'), lines.join('\n'), [
      { text: t('common.ok'), onPress: () => router.back() },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  if (!bookingId || !progress || progress.total === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('tourDays.notFound')}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const route = booking ? routeSummary(booking) : '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl * 2 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={COLORS.gold} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('tourDays.title')}</Text>
        {route ? <Text style={styles.route}>{route}</Text> : null}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((progress.closed / progress.total) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress.closed}/{progress.total}
          </Text>
        </View>
      </View>

      {progress.days.map((day) => {
        const isOpenForm = openDay === day.dayIndex;
        const state = day.isClosed ? 'closed' : day.canClose ? 'ready' : 'waiting';
        return (
          <View
            key={day.dayIndex}
            style={[
              styles.card,
              state === 'closed' ? styles.cardClosed : null,
              state === 'ready' ? styles.cardReady : null,
            ]}
          >
            <View style={styles.cardHead}>
              <Text style={styles.dayLabel}>
                {t('tourDays.day', { n: day.dayIndex })}
                {day.dayDate ? ` · ${day.dayDate}` : ''}
              </Text>
              <View
                style={[
                  styles.badge,
                  state === 'closed' ? styles.badgeClosed : null,
                  state === 'ready' ? styles.badgeReady : null,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    state === 'closed' ? styles.badgeTextClosed : null,
                    state === 'ready' ? styles.badgeTextReady : null,
                  ]}
                >
                  {state === 'closed'
                    ? t('tourDays.stateClosed')
                    : state === 'ready'
                      ? t('tourDays.stateReady')
                      : t('tourDays.stateWaiting')}
                </Text>
              </View>
            </View>

            {day.fromPlace || day.toPlace ? (
              <Text style={styles.dayRoute}>
                {[day.fromPlace, day.toPlace].filter(Boolean).join(' → ')}
              </Text>
            ) : null}
            {day.stops ? <Text style={styles.dayStops}>{day.stops}</Text> : null}
            {day.plannedOvernight ? (
              <Text style={styles.dayMeta}>
                {t('tourDays.plannedOvernight')}: {day.plannedOvernight}
              </Text>
            ) : null}

            {day.isClosed ? (
              <View style={styles.closedBox}>
                {day.odometerValue != null ? (
                  <Text style={styles.closedLine}>
                    {t('tourDays.odometer')}: {day.odometerValue}
                  </Text>
                ) : null}
                {day.overnightPlace ? (
                  <Text style={styles.closedLine}>
                    {t('tourDays.overnight')}: {day.overnightPlace}
                  </Text>
                ) : null}
                {day.extraCostsGel != null && day.extraCostsGel > 0 ? (
                  <Text style={styles.closedLine}>
                    {t('tourDays.costs')}: {day.extraCostsGel} ₾
                  </Text>
                ) : null}
                {day.note ? <Text style={styles.closedLine}>{day.note}</Text> : null}
              </View>
            ) : null}

            {isOpenForm ? (
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>{t('tourDays.odometer')}</Text>
                <TextInput
                  style={styles.input}
                  value={odometer}
                  onChangeText={setOdometer}
                  keyboardType="decimal-pad"
                  placeholder={t('tourDays.odometerHint')}
                  placeholderTextColor={COLORS.textMuted}
                />

                {Platform.OS !== 'web' || photoUrl ? (
                  <Pressable
                    style={styles.photoBtn}
                    onPress={() => void onTakePhoto(day.dayIndex)}
                  >
                    <Text style={styles.photoBtnText}>
                      {photoUrl ? t('tourDays.photoTaken') : t('tourDays.takePhoto')}
                    </Text>
                  </Pressable>
                ) : null}

                <Text style={styles.fieldLabel}>{t('tourDays.overnight')}</Text>
                <TextInput
                  style={styles.input}
                  value={overnight}
                  onChangeText={setOvernight}
                  placeholder={t('tourDays.overnightHint')}
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={styles.fieldLabel}>{t('tourDays.costs')}</Text>
                <TextInput
                  style={styles.input}
                  value={costs}
                  onChangeText={setCosts}
                  keyboardType="decimal-pad"
                  placeholder={t('tourDays.costsHint')}
                  placeholderTextColor={COLORS.textMuted}
                />

                <Text style={styles.fieldLabel}>{t('tourDays.note')}</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholder={t('tourDays.noteHint')}
                  placeholderTextColor={COLORS.textMuted}
                />

                <View style={styles.formActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setOpenDay(null);
                      resetForm();
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, saving ? styles.btnDisabled : null]}
                    disabled={saving}
                    onPress={() => void onCloseDay(day.dayIndex)}
                  >
                    {saving ? (
                      <ActivityIndicator color={COLORS.white} size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('tourDays.closeDay')}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={[
                  styles.dayAction,
                  !day.canClose && !day.isClosed ? styles.btnDisabled : null,
                ]}
                disabled={!day.canClose && !day.isClosed}
                onPress={() => startClosing(day)}
              >
                <Text style={styles.dayActionText}>
                  {day.isClosed ? t('tourDays.edit') : t('tourDays.closeDay')}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <Pressable
        style={[styles.finishBtn, !progress.allClosed || finishing ? styles.btnDisabled : null]}
        disabled={!progress.allClosed || finishing}
        onPress={() => void onFinishTour()}
      >
        {finishing ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.finishBtnText}>{t('tourDays.finishTour')}</Text>
        )}
      </Pressable>
      {!progress.allClosed ? (
        <Text style={styles.finishHint}>
          {t('tourDays.finishHint', { closed: progress.closed, total: progress.total })}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.md },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  muted: { color: COLORS.textSecondary, fontSize: 15 },
  header: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.card,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  route: { fontSize: 14, color: COLORS.textSecondary },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  progressText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardClosed: { borderColor: COLORS.success, backgroundColor: '#F6FFFB' },
  cardReady: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  badgeClosed: { backgroundColor: '#DCFCE7' },
  badgeReady: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  badgeTextClosed: { color: '#047857' },
  badgeTextReady: { color: COLORS.goldDark },
  dayRoute: { fontSize: 14, color: COLORS.text, marginTop: 2 },
  dayStops: { fontSize: 13, color: COLORS.textSecondary },
  dayMeta: { fontSize: 12, color: COLORS.textMuted },
  closedBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    gap: 2,
  },
  closedLine: { fontSize: 13, color: COLORS.textSecondary },
  form: { marginTop: SPACING.sm, gap: SPACING.xs },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  photoBtn: {
    marginTop: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    alignItems: 'center',
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.goldDark },
  formActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  dayAction: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.text,
    alignItems: 'center',
  },
  dayActionText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.45 },
  finishBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.success,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  finishHint: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
