import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  buildSimpleConvoyLegs,
  createGroupConvoy,
  splitPassengersEvenly,
  suggestVehicleCount,
} from '../../lib/groupBooking';
import { showErrorAlert, showValidationAlert } from '../../lib/validation';

export default function GroupBookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [totalPassengers, setTotalPassengers] = useState('50');
  const [busCount, setBusCount] = useState('2');
  const [busCountManual, setBusCountManual] = useState(false);
  const [totalPrice, setTotalPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const companyName = useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const cn = meta?.companyName;
    if (typeof cn === 'string' && cn.trim()) return cn.trim();
    return profile?.full_name?.trim() || user?.email || null;
  }, [profile?.full_name, user]);

  const totalPax = Math.max(1, parseInt(totalPassengers, 10) || 1);
  const totalGel = Math.max(0, parseFloat(totalPrice.replace(',', '.')) || 0);
  const vehicleCount = Math.max(1, parseInt(busCount, 10) || 1);

  useEffect(() => {
    if (!busCountManual) {
      setBusCount(String(suggestVehicleCount(totalPax)));
    }
  }, [totalPax, busCountManual]);

  const splitPreview = useMemo(
    () => splitPassengersEvenly(totalPax, vehicleCount),
    [totalPax, vehicleCount],
  );

  const submit = async () => {
    if (!user?.id) return;
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

    setSubmitting(true);
    const dateDisplay = formatDisplayDateTime(startDate);
    const route = `${fromCity.trim()} → ${toCity.trim()}`;
    const legs = buildSimpleConvoyLegs(totalPax, vehicleCount);

    const { masterId, broadcastCount, error } = await createGroupConvoy(
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
        vehicle_type: 'bus',
        vehicle_class: 'comfort',
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
        comment: null,
        payment_method: null,
        price_gel: totalGel,
        created_by_name: profile?.full_name?.trim() || null,
      },
      legs,
      { autoBroadcast: true },
    );
    setSubmitting(false);

    if (error || !masterId) {
      showErrorAlert(error?.message ?? t('groupConvoy.createFailed'));
      return;
    }

    Alert.alert(
      t('groupConvoy.successTitle'),
      t('groupConvoy.successBody', {
        buses: vehicleCount,
        notified: broadcastCount ?? vehicleCount,
      }),
      [{ text: 'OK', onPress: () => router.replace('/(app)/dashboard') }],
    );
  };

  const padTop = insets.top + APP_HEADER_BODY_HEIGHT + 8;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: padTop, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('groupConvoy.title')}</Text>
        <Text style={styles.subtitle}>{t('groupConvoy.subtitleSimple')}</Text>

        <View style={styles.card}>
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
            onChange={setStartDate}
            minimumDate={new Date()}
          />
          <AuthInput
            label={t('groupConvoy.totalPassengers')}
            value={totalPassengers}
            onChangeText={setTotalPassengers}
            keyboardType="number-pad"
          />
          <AuthInput
            label={t('groupConvoy.busCount')}
            value={busCount}
            onChangeText={(v) => {
              setBusCountManual(true);
              setBusCount(v);
            }}
            keyboardType="number-pad"
          />
          <Text style={styles.preview}>
            {t('groupConvoy.autoSplitPreview', {
              buses: vehicleCount,
              list: splitPreview
                .map((n, i) => t('groupConvoy.legShort', { n: i + 1 }) + `: ${n}`)
                .join(' · '),
            })}
          </Text>
          <AuthInput
            label={t('groupConvoy.totalPriceOptional')}
            value={totalPrice}
            onChangeText={setTotalPrice}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={submitting}
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.primaryBtnText}>{t('groupConvoy.createAndNotify')}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: SPACING.lg },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  preview: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontWeight: '800', color: COLORS.white, fontSize: 16 },
  backBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  backBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
});
