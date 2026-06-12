import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../../components/AuthInput';
import { DateTimeField } from '../../components/DateTimeField';
import { SearchableCitySelect } from '../../components/SearchableCitySelect';
import { APP_HEADER_BODY_HEIGHT } from '../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDateTime } from '../../lib/dateTime';
import {
  createGroupConvoy,
  splitPassengersByCapacity,
  splitPassengersEvenly,
  type GroupConvoyLegPlan,
} from '../../lib/groupBooking';
import { fetchMatchingDrivers, type MatchingDriver } from '../../lib/drivers';
import {
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import { showErrorAlert, showValidationAlert } from '../../lib/validation';

type SplitMode = 'legCount' | 'capacity';

type LegDraft = {
  passengers: number;
  vehicle_type: VehicleTypeCode;
  vehicle_class: VehicleClassCode;
  driver_id: string | null;
  driverName: string | null;
};

export default function GroupBookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [step, setStep] = useState(0);
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [totalPassengers, setTotalPassengers] = useState('50');
  const [totalPrice, setTotalPrice] = useState('');
  const [comment, setComment] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('legCount');
  const [legCountInput, setLegCountInput] = useState('3');
  const [capacityInput, setCapacityInput] = useState('49');
  const [defaultVehicleType, setDefaultVehicleType] = useState<VehicleTypeCode>('bus');
  const [defaultVehicleClass, setDefaultVehicleClass] = useState<VehicleClassCode>('comfort');
  const [legDrafts, setLegDrafts] = useState<LegDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerLegIndex, setPickerLegIndex] = useState<number | null>(null);
  const [driversLoading, setDriversLoading] = useState(false);
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);

  const companyName = useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const cn = meta?.companyName;
    if (typeof cn === 'string' && cn.trim()) return cn.trim();
    return profile?.full_name?.trim() || user?.email || null;
  }, [profile?.full_name, user]);

  const totalPax = Math.max(1, parseInt(totalPassengers, 10) || 1);
  const totalGel = Math.max(0, parseFloat(totalPrice.replace(',', '.')) || 0);

  const buildLegDrafts = useCallback((): LegDraft[] => {
    const counts =
      splitMode === 'capacity'
        ? splitPassengersByCapacity(totalPax, parseInt(capacityInput, 10) || 49)
        : splitPassengersEvenly(totalPax, parseInt(legCountInput, 10) || 1);
    return counts.map((pax) => ({
      passengers: pax,
      vehicle_type: defaultVehicleType,
      vehicle_class: defaultVehicleClass,
      driver_id: null,
      driverName: null,
    }));
  }, [
    capacityInput,
    defaultVehicleClass,
    defaultVehicleType,
    legCountInput,
    splitMode,
    totalPax,
  ]);

  const goNext = () => {
    if (step === 0) {
      if (!fromCity.trim() || !toCity.trim()) {
        showValidationAlert(t('groupConvoy.validationRoute'));
        return;
      }
      if (!startDate) {
        showValidationAlert(t('groupConvoy.validationDate'));
        return;
      }
      if (totalPax < 2) {
        showValidationAlert(t('groupConvoy.validationPassengers'));
        return;
      }
    }
    if (step === 1) {
      setLegDrafts(buildLegDrafts());
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const goBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const updateLeg = (index: number, patch: Partial<LegDraft>) => {
    setLegDrafts((prev) => prev.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));
  };

  const openDriverPicker = async (index: number) => {
    const leg = legDrafts[index];
    if (!leg) return;
    setPickerLegIndex(index);
    setDriversLoading(true);
    const { data } = await fetchMatchingDrivers(
      leg.vehicle_type,
      leg.vehicle_class,
      null,
      fromCity.trim() || null,
      'all',
      leg.passengers,
    );
    setDrivers(data);
    setDriversLoading(false);
  };

  const submit = async () => {
    if (!user?.id) return;
    if (legDrafts.length === 0) {
      showValidationAlert(t('groupConvoy.validationLegs'));
      return;
    }
    setSubmitting(true);
    const dateDisplay = startDate ? formatDisplayDateTime(startDate) : null;
    const route = `${fromCity.trim()} → ${toCity.trim()}`;
    const legs: GroupConvoyLegPlan[] = legDrafts.map((leg, i) => ({
      legIndex: i + 1,
      passengers: leg.passengers,
      vehicle_type: leg.vehicle_type,
      vehicle_class: leg.vehicle_class,
      driver_id: leg.driver_id,
    }));

    const { masterId, error } = await createGroupConvoy(
      {
        company_id: user.id,
        company_name: companyName,
        kind: 'tour',
        from_location: fromCity.trim(),
        from_location_type: 'city',
        to_location: toCity.trim(),
        to_location_type: 'city',
        route,
        date_display: dateDisplay,
        passengers: totalPax,
        vehicle_type: defaultVehicleType,
        vehicle_class: defaultVehicleClass,
        flight_number: null,
        meet_greet: false,
        sign_text: null,
        passenger_name: null,
        passenger_phone: null,
        flight_direction: null,
        pickup_time: null,
        client_price: totalGel || null,
        commission: null,
        tour_days: null,
        itinerary: null,
        transfer_in: null,
        transfer_out: null,
        comment: comment.trim() || null,
        payment_method: null,
        price_gel: totalGel,
        created_by_name: profile?.full_name?.trim() || null,
      },
      legs,
    );
    setSubmitting(false);
    if (error || !masterId) {
      showErrorAlert(error?.message ?? t('groupConvoy.createFailed'));
      return;
    }
    router.replace({
      pathname: '/(app)/group-dispatch/[id]',
      params: { id: masterId },
    });
  };

  const padTop = insets.top + APP_HEADER_BODY_HEIGHT + 8;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: padTop, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('groupConvoy.title')}</Text>
        <Text style={styles.subtitle}>{t('groupConvoy.subtitle')}</Text>

        <View style={styles.steps}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.stepDot, i <= step ? styles.stepDotActive : null]}
            />
          ))}
        </View>

        {step === 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t('groupConvoy.stepRoute')}</Text>
            <SearchableCitySelect
              label={t('groupConvoy.fromCity')}
              value={fromCity}
              onChange={setFromCity}
            />
            <SearchableCitySelect
              label={t('groupConvoy.toCity')}
              value={toCity}
              onChange={setToCity}
            />
            <DateTimeField
              label={t('groupConvoy.startDate')}
              value={startDate}
              onChange={(d) => setStartDate(d)}
              minimumDate={new Date()}
            />
            <AuthInput
              label={t('groupConvoy.totalPassengers')}
              value={totalPassengers}
              onChangeText={setTotalPassengers}
              keyboardType="number-pad"
            />
            <AuthInput
              label={t('groupConvoy.totalPrice')}
              value={totalPrice}
              onChangeText={setTotalPrice}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <AuthInput
              label={t('groupConvoy.commentOptional')}
              value={comment}
              onChangeText={setComment}
              multiline
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t('groupConvoy.stepSplit')}</Text>
            <View style={styles.splitRow}>
              <Pressable
                onPress={() => setSplitMode('legCount')}
                style={[styles.splitChip, splitMode === 'legCount' && styles.splitChipActive]}
              >
                <Text style={[styles.splitChipText, splitMode === 'legCount' && styles.splitChipTextActive]}>
                  {t('groupConvoy.splitByLegCount')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSplitMode('capacity')}
                style={[styles.splitChip, splitMode === 'capacity' && styles.splitChipActive]}
              >
                <Text style={[styles.splitChipText, splitMode === 'capacity' && styles.splitChipTextActive]}>
                  {t('groupConvoy.splitByCapacity')}
                </Text>
              </Pressable>
            </View>
            {splitMode === 'legCount' ? (
              <AuthInput
                label={t('groupConvoy.vehicleCount')}
                value={legCountInput}
                onChangeText={setLegCountInput}
                keyboardType="number-pad"
              />
            ) : (
              <AuthInput
                label={t('groupConvoy.seatsPerVehicle')}
                value={capacityInput}
                onChangeText={setCapacityInput}
                keyboardType="number-pad"
              />
            )}
            <Text style={styles.previewLabel}>{t('groupConvoy.splitPreview')}</Text>
            <Text style={styles.previewText}>
              {buildLegDrafts()
                .map((l, i) => `${t('groupConvoy.legShort', { n: i + 1 })}: ${l.passengers}`)
                .join(' · ')}
            </Text>
            <Text style={styles.sectionLabel}>{t('groupConvoy.defaultVehicle')}</Text>
            <View style={styles.chipRow}>
              {VEHICLE_TYPES.map((vt) => (
                <Pressable
                  key={vt}
                  onPress={() => setDefaultVehicleType(vt)}
                  style={[styles.chip, defaultVehicleType === vt && styles.chipActive]}
                >
                  <Text style={[styles.chipText, defaultVehicleType === vt && styles.chipTextActive]}>
                    {vehicleTypeLabel(vt)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chipRow}>
              {VEHICLE_CLASSES.map((vc) => (
                <Pressable
                  key={vc}
                  onPress={() => setDefaultVehicleClass(vc)}
                  style={[styles.chip, defaultVehicleClass === vc && styles.chipActive]}
                >
                  <Text style={[styles.chipText, defaultVehicleClass === vc && styles.chipTextActive]}>
                    {vehicleClassLabel(vc)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t('groupConvoy.stepLegs')}</Text>
            {legDrafts.map((leg, index) => (
              <View key={index} style={styles.legCard}>
                <Text style={styles.legTitle}>
                  {t('groupConvoy.legTitle', { n: index + 1, pax: leg.passengers })}
                </Text>
                <View style={styles.chipRow}>
                  {VEHICLE_TYPES.map((vt) => (
                    <Pressable
                      key={vt}
                      onPress={() => updateLeg(index, { vehicle_type: vt, driver_id: null, driverName: null })}
                      style={[styles.chipSmall, leg.vehicle_type === vt && styles.chipActive]}
                    >
                      <Text style={[styles.chipTextSmall, leg.vehicle_type === vt && styles.chipTextActive]}>
                        {vehicleTypeLabel(vt)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => void openDriverPicker(index)} style={styles.driverPickBtn}>
                  <Ionicons name="person-outline" size={16} color={COLORS.goldDark} />
                  <Text style={styles.driverPickText}>
                    {leg.driverName ?? t('groupConvoy.assignDriverOptional')}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {pickerLegIndex != null ? (
          <View style={styles.driverModal}>
            <Text style={styles.driverModalTitle}>{t('groupConvoy.pickDriver')}</Text>
            {driversLoading ? (
              <ActivityIndicator color={COLORS.gold} />
            ) : drivers.length === 0 ? (
              <Text style={styles.emptyDrivers}>{t('groupConvoy.noDrivers')}</Text>
            ) : (
              drivers.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    updateLeg(pickerLegIndex, {
                      driver_id: d.id,
                      driverName: d.full_name ?? d.id.slice(0, 8),
                    });
                    setPickerLegIndex(null);
                  }}
                  style={styles.driverRow}
                >
                  <Text style={styles.driverRowName}>{d.full_name ?? '—'}</Text>
                  <Text style={styles.driverRowMeta}>
                    {[
                      d.vehicle?.type ? vehicleTypeLabel(d.vehicle.type) : null,
                      d.vehicle?.plate,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              ))
            )}
            <Pressable onPress={() => setPickerLegIndex(null)} style={styles.driverModalClose}>
              <Text style={styles.driverModalCloseText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Pressable onPress={goBack} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>
              {step === 0 ? t('common.back') : t('groupConvoy.back')}
            </Text>
          </Pressable>
          {step < 2 ? (
            <Pressable onPress={goNext} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{t('groupConvoy.next')}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void submit()}
              disabled={submitting}
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('groupConvoy.create')}</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: SPACING.lg },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.md },
  steps: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  stepDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  stepDotActive: { backgroundColor: COLORS.gold },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  splitRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  splitChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  splitChipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  splitChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  splitChipTextActive: { color: COLORS.goldDark },
  previewLabel: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.sm },
  previewText: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextSmall: { fontSize: 12, color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.goldDark, fontWeight: '700' },
  legCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  legTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  driverPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.sm,
    paddingVertical: 8,
  },
  driverPickText: { fontSize: 14, color: COLORS.goldDark, fontWeight: '600' },
  driverModal: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  driverModalTitle: { fontSize: 16, fontWeight: '700', marginBottom: SPACING.md },
  emptyDrivers: { color: COLORS.textSecondary, marginBottom: SPACING.md },
  driverRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  driverRowName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  driverRowMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  driverModalClose: { marginTop: SPACING.md, alignItems: 'center' },
  driverModalCloseText: { color: COLORS.textSecondary, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '700', color: COLORS.textSecondary },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontWeight: '800', color: COLORS.white },
});
