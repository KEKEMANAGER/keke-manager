import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthInput } from '../../components/AuthInput';
import { DateTimeField } from '../../components/DateTimeField';
import {
  formatDisplayDateTime,
  toIsoString,
} from '../../lib/dateTime';
import { AppLogo } from '../../components/AppLogo';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  insertBooking,
  normalizeBookingKind,
  type BookingType as DbBookingType,
  type ItineraryDay,
  type TourTransferLeg,
} from '../../lib/bookings';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
  VEHICLE_CLASSES,
  VEHICLE_TYPES,
  vehicleClassLabel,
  vehicleTypeLabel,
  type VehicleClassCode,
  type VehicleTypeCode,
} from '../../lib/vehicleCatalog';
import {
  mapSupabaseError,
  showErrorAlert,
  showValidationAlert,
} from '../../lib/validation';
import { fetchCompanyMembers, type CompanyMember } from '../../lib/companyMembers';
import { bookingKindLabel } from '../../lib/bookingLabels';
import { fetchMatchingDrivers, type MatchingDriver } from '../../lib/drivers';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { User } from '@supabase/supabase-js';

type BookingKindUi = 'transfer' | 'tour' | 'dayTour';
type TransferTab = 'arrival' | 'departure';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
type PaymentWhen = 'now' | 'later' | 'clientCard';
type CommissionMode = 'gel' | 'percent';

const PAYMENT_OPTIONS: PaymentWhen[] = ['now', 'later', 'clientCard'];

function bookingKindUiLabel(ui: BookingKindUi, transferTab?: TransferTab): string {
  const code =
    ui === 'transfer'
      ? transferTab === 'departure'
        ? 'transfer_departure'
        : 'transfer_arrival'
      : ui === 'tour'
        ? 'tour'
        : 'day_tour';
  return bookingKindLabel(code);
}

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function mapBookingType(t: BookingKindUi): DbBookingType {
  if (t === 'transfer') return 'transfer';
  if (t === 'tour') return 'tour';
  return 'day_tour';
}

function switchTransferTab(setTab: (t: TransferTab) => void, tab: TransferTab) {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setTab(tab);
}

function companyDisplayName(profile: Profile | null, user: User | null) {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? null;
}

function calcMockPrice(params: {
  type: BookingKindUi;
  passengers: number;
  vehicleClass: VehicleClassCode;
}): number {
  let base = params.type === 'transfer' ? 120 : params.type === 'tour' ? 450 : 280;
  base += Math.max(0, params.passengers - 1) * 25;
  const mult =
    params.vehicleClass === 'premium' ? 1.45 : params.vehicleClass === 'comfort' ? 1.2 : 1;
  return Math.round(base * mult);
}

function parseAmountGeorgian(raw: string): number {
  const t = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Commission as GEL for display and DB (percent is converted from client price). */
function commissionGelAmount(
  clientGel: number,
  commissionRaw: string,
  mode: CommissionMode,
): number {
  const v = parseAmountGeorgian(commissionRaw);
  if (v <= 0) return 0;
  if (mode === 'gel') return Math.round(v * 100) / 100;
  const pct = Math.min(100, Math.max(0, v));
  if (clientGel <= 0) return 0;
  return Math.round(clientGel * (pct / 100) * 100) / 100;
}

function initialItineraryDay(day = 1): ItineraryDay {
  return { day, from: '', to: '', stops: '' };
}

function emptyTransferLeg(): TourTransferLeg {
  return { date: '', flight: '', passengerName: '' };
}

function persistItineraryForDb(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((d, idx) => ({
    day: idx + 1,
    from: d.from.trim(),
    to: d.to.trim(),
    stops: d.stops.trim(),
  }));
}

function buildTourRouteDescription(
  days: ItineraryDay[],
  formatDayLine: (day: number, from: string, to: string) => string,
): string | null {
  const parts = days
    .map((d) => {
      const f = d.from.trim();
      const to = d.to.trim();
      if (!f && !to) return null;
      return formatDayLine(d.day, f || '—', to || '—');
    })
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(' | ') : null;
}

function tourEndpoints(days: ItineraryDay[]): { from: string | null; to: string | null } {
  if (!days.length) return { from: null, to: null };
  const firstFrom = days[0].from.trim();
  const lastTo = days[days.length - 1].to.trim();
  return {
    from: firstFrom || null,
    to: lastTo || null,
  };
}

function tourBookingDateIso(tinAt: Date | null, toutAt: Date | null): string | null {
  if (tinAt) return toIsoString(tinAt);
  if (toutAt) return toIsoString(toutAt);
  return null;
}

function transferLegOrNull(leg: TourTransferLeg): TourTransferLeg | null {
  if (!leg.date.trim() && !leg.flight.trim() && !leg.passengerName.trim()) return null;
  return {
    date: leg.date.trim(),
    flight: leg.flight.trim(),
    passengerName: leg.passengerName.trim(),
  };
}

function OptionalTransferToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        onChange(!value);
      }}
      style={({ pressed }) => [
        styles.meetToggleCompact,
        value ? styles.meetToggleOn : styles.meetToggleOff,
        pressed && styles.pressed,
      ]}
    >
      <Text style={value ? styles.meetToggleTextOn : styles.meetToggleTextOff}>{label}</Text>
    </Pressable>
  );
}

function TransferSegmented({
  tab,
  onChange,
}: {
  tab: TransferTab;
  onChange: (t: TransferTab) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.segmentTrack}>
      {(
        [
          { id: 'arrival' as const, labelKey: 'newBooking.transferTab.arrival' },
          { id: 'departure' as const, labelKey: 'newBooking.transferTab.departure' },
        ] as const
      ).map((item) => {
        const active = tab === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => switchTransferTab(onChange, item.id)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {t(item.labelKey)}
            </Text>
            {active ? <View style={styles.segmentUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ServiceKindSelector({
  value,
  onChange,
}: {
  value: BookingKindUi;
  onChange: (k: BookingKindUi) => void;
}) {
  const { t } = useTranslation();
  const items: { id: BookingKindUi; label: string }[] = [
    { id: 'transfer', label: bookingKindLabel('transfer') },
    { id: 'tour', label: bookingKindLabel('tour') },
    { id: 'dayTour', label: bookingKindLabel('day_tour') },
  ];
  return (
    <View style={styles.serviceKindWrap}>
      <Text style={styles.serviceKindSectionLabel}>{t('newBooking.serviceKind')}</Text>
      <View style={styles.serviceKindRow}>
        {items.map((item) => {
          const active = value === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                onChange(item.id);
              }}
              style={({ pressed }) => [
                styles.serviceKindBtn,
                active && styles.serviceKindBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.serviceKindBtnText, active && styles.serviceKindBtnTextActive]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OperatorPicker({
  members,
  loading,
  selectedName,
  onSelect,
}: {
  members: CompanyMember[];
  loading: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.block, styles.operatorBlock]}>
      <Text style={styles.fieldLabel}>{t('newBooking.operator')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.sm }} />
      ) : members.length === 0 ? (
        <Text style={styles.operatorHint}>{t('newBooking.operatorHint')}</Text>
      ) : (
        <View style={styles.chips}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m.name)}
              style={[styles.chip, selectedName === m.name && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedName === m.name && styles.chipTextActive]}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

type DriverTargetMode = 'all' | 'specific';

function formatDriverLanguages(languages: string[]): string {
  if (!languages.length) return '';
  return languages.join(', ');
}

function matchingDriverVehicleLine(vehicle: MatchingDriver['vehicle']): string {
  if (!vehicle) return '';
  const parts: string[] = [];
  if (vehicle.model?.trim()) parts.push(vehicle.model.trim());
  if (vehicle.year != null) parts.push(String(vehicle.year));
  const head = parts.join(' ');
  if (vehicle.color?.trim()) {
    return head ? `${head}, ${vehicle.color.trim()}` : vehicle.color.trim();
  }
  return head;
}

function MatchingDriversSection({
  active,
  vehicleType,
  vehicleClass,
  driverTargetMode,
  onDriverTargetModeChange,
  selectedDriverId,
  onSelectDriver,
  onDriversLoaded,
}: {
  active: boolean;
  vehicleType: VehicleTypeCode;
  vehicleClass: VehicleClassCode;
  driverTargetMode: DriverTargetMode;
  onDriverTargetModeChange: (mode: DriverTargetMode) => void;
  selectedDriverId: string | null;
  onSelectDriver: (id: string | null) => void;
  onDriversLoaded?: (drivers: MatchingDriver[]) => void;
}) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const normType = normalizeVehicleType(vehicleType);
  const normClass = normalizeVehicleClass(vehicleClass);

  useEffect(() => {
    if (!active || !normType || !normClass) {
      if (!active) {
        setDrivers([]);
        setLoadError(null);
        setLoading(false);
        onDriversLoaded?.([]);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void fetchMatchingDrivers(vehicleType, vehicleClass).then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error.message);
        setDrivers([]);
        onDriversLoaded?.([]);
        return;
      }
      setDrivers(data);
      onDriversLoaded?.(data);
      if (data.length === 0) {
        onDriverTargetModeChange('all');
        onSelectDriver(null);
      } else if (selectedDriverId && !data.some((d) => d.id === selectedDriverId)) {
        onSelectDriver(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [active, vehicleType, vehicleClass, normType, normClass]);

  if (!active || !normType || !normClass) {
    return null;
  }

  const driverCountLabel = loading ? '…' : String(drivers.length);

  return (
    <View style={styles.matchingDriversBlock}>
      <Text style={styles.driversSectionTitle}>{t('newBooking.drivers')}</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={styles.matchingDriversLoader} />
      ) : loadError ? (
        <Text style={styles.matchingDriversEmpty}>{loadError}</Text>
      ) : drivers.length === 0 ? (
        <View style={styles.driversNoMatchBox}>
          <Text style={styles.driversNoMatchTitle}>{t('newBooking.noDriversTitle')}</Text>
          <Text style={styles.driversNoMatchBody}>{t('newBooking.noDriversBody')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.driverTargetRow}>
            <Pressable
              onPress={() => {
                onDriverTargetModeChange('all');
                onSelectDriver(null);
              }}
              style={({ pressed }) => [
                styles.driverTargetOption,
                driverTargetMode === 'all' && styles.driverTargetOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.radioOuter, driverTargetMode === 'all' && styles.radioOuterActive]}>
                {driverTargetMode === 'all' ? <View style={styles.radioInner} /> : null}
              </View>
              <Text
                style={[
                  styles.driverTargetLabel,
                  driverTargetMode === 'all' && styles.driverTargetLabelActive,
                ]}
              >
                {t('newBooking.sendToAll')}{' '}
                <Text style={styles.driverCountBadge}>
                  {t('newBooking.driverCount', { count: driverCountLabel })}
                </Text>
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onDriverTargetModeChange('specific')}
              style={({ pressed }) => [
                styles.driverTargetOption,
                driverTargetMode === 'specific' && styles.driverTargetOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  driverTargetMode === 'specific' && styles.radioOuterActive,
                ]}
              >
                {driverTargetMode === 'specific' ? <View style={styles.radioInner} /> : null}
              </View>
              <Text
                style={[
                  styles.driverTargetLabel,
                  driverTargetMode === 'specific' && styles.driverTargetLabelActive,
                ]}
              >
                {t('newBooking.selectDriver')}
              </Text>
            </Pressable>
          </View>

          {driverTargetMode === 'specific'
            ? drivers.map((driver) => {
                const selected = selectedDriverId === driver.id;
                const vehicleLine = matchingDriverVehicleLine(driver.vehicle);
                const langs = formatDriverLanguages(driver.languages);
                const experienceLine =
                  driver.experience_years > 0
                    ? t('newBooking.experienceYears', { years: driver.experience_years })
                    : null;
                const ratingLine =
                  driver.rating != null
                    ? `⭐ ${driver.rating}${driver.rating_count > 0 ? ` (${driver.rating_count})` : ''}`
                    : '⭐ —';
                return (
                  <Pressable
                    key={driver.id}
                    onPress={() => onSelectDriver(selected ? null : driver.id)}
                    style={({ pressed }) => [
                      styles.driverCard,
                      selected && styles.driverCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.driverCardTop}>
                      {driver.avatar_url ? (
                        <Image source={{ uri: driver.avatar_url }} style={styles.driverAvatar} />
                      ) : (
                        <View style={[styles.driverAvatar, styles.driverAvatarPlaceholder]}>
                          <Ionicons name="person" size={28} color={COLORS.textMuted} />
                        </View>
                      )}
                      <View style={styles.driverCardMain}>
                        <NameWithVerifiedBadge
                          name={driver.full_name || t('driver.defaultName')}
                          verified={driver.is_verified}
                          textStyle={styles.driverName}
                          numberOfLines={1}
                        />
                        {vehicleLine ? (
                          <Text style={styles.driverVehicleLine}>🚗 {vehicleLine}</Text>
                        ) : (
                          <Text style={styles.driverVehicleLineMuted}>{t('newBooking.noVehicle')}</Text>
                        )}
                        <Text style={styles.driverMetaLine}>{ratingLine}</Text>
                        {langs ? <Text style={styles.driverMetaLine}>🗣 {langs}</Text> : null}
                        {experienceLine ? (
                          <Text style={styles.driverMetaLine}>{experienceLine}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={[styles.driverChooseBtn, selected && styles.driverChooseBtnSelected]}
                    >
                      <Text
                        style={[
                          styles.driverChooseBtnText,
                          selected && styles.driverChooseBtnTextSelected,
                        ]}
                      >
                        {selected ? t('newBooking.selected') : t('newBooking.choose')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            : null}
        </>
      )}
    </View>
  );
}

function VehiclePicker({
  selectedVehicleType,
  onVehicleTypeChange,
  vehicleClass,
  onVehicleClassChange,
}: {
  selectedVehicleType: VehicleTypeCode;
  onVehicleTypeChange: (type: VehicleTypeCode) => void;
  vehicleClass: VehicleClassCode;
  onVehicleClassChange: (cls: VehicleClassCode) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.sectionHeader}>{t('newBooking.vehicleSection')}</Text>
      <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleType')}</Text>
      <View style={styles.chips}>
        {VEHICLE_TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => onVehicleTypeChange(t)}
            style={[styles.chip, selectedVehicleType === t && styles.chipActive]}
          >
            <Text style={[styles.chipText, selectedVehicleType === t && styles.chipTextActive]}>
              {vehicleTypeLabel(t)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>{t('newBooking.form.vehicleClass')}</Text>
      <View style={styles.chips}>
        {VEHICLE_CLASSES.map((c) => (
          <Pressable
            key={c}
            onPress={() => onVehicleClassChange(c)}
            style={[styles.chip, vehicleClass === c && styles.chipActive]}
          >
            <Text style={[styles.chipText, vehicleClass === c && styles.chipTextActive]}>
              {vehicleClassLabel(c)}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export default function NewBookingScreen() {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preset } = useLocalSearchParams<{ preset?: string }>();

  void i18n.language;
  void i18n.resolvedLanguage;

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking_kind, set_booking_kind] = useState<BookingKindUi>('transfer');

  const [transferTab, setTransferTab] = useState<TransferTab>('arrival');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [arrivalDestination, setArrivalDestination] = useState('');
  const [arrivalFlightNo, setArrivalFlightNo] = useState('');
  const [arrivalDateTime, setArrivalDateTime] = useState<Date | null>(null);
  const [departureAddress, setDepartureAddress] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);

  const [bookingDateTime, setBookingDateTime] = useState<Date | null>(null);
  const [passengers, setPassengers] = useState('2');
  const [vehicleClass, setVehicleClass] = useState<VehicleClassCode>('comfort');
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleTypeCode>(VEHICLE_TYPES[0]);
  const [driverTargetMode, setDriverTargetMode] = useState<DriverTargetMode>('all');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [matchingDrivers, setMatchingDrivers] = useState<MatchingDriver[]>([]);

  useEffect(() => {
    setSelectedDriverId(null);
    setDriverTargetMode('all');
  }, [selectedVehicleType, vehicleClass]);

  const [meetGreet, setMeetGreet] = useState(false);
  const [signText, setSignText] = useState('');
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [clientPriceStr, setClientPriceStr] = useState('');
  const [commissionStr, setCommissionStr] = useState('');
  const [commissionMode, setCommissionMode] = useState<CommissionMode>('gel');
  const [comment, setComment] = useState('');
  const [tourRouteDescription, setTourRouteDescription] = useState('');

  const [days, setDays] = useState<ItineraryDay[]>(() => [initialItineraryDay(1)]);
  const [transferIn, setTransferIn] = useState<TourTransferLeg>(() => emptyTransferLeg());
  const [transferOut, setTransferOut] = useState<TourTransferLeg>(() => emptyTransferLeg());
  const [transferInDateTime, setTransferInDateTime] = useState<Date | null>(null);
  const [transferOutDateTime, setTransferOutDateTime] = useState<Date | null>(null);
  const [hasArrivalTransfer, setHasArrivalTransfer] = useState(false);
  const [hasDepartureTransfer, setHasDepartureTransfer] = useState(false);

  const [paymentWhen, setPaymentWhen] = useState<PaymentWhen>('now');
  const [operators, setOperators] = useState<CompanyMember[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [selectedOperatorName, setSelectedOperatorName] = useState<string | null>(null);

  const loadOperators = useCallback(async () => {
    if (!user?.id) {
      setOperators([]);
      setSelectedOperatorName(null);
      return;
    }
    setOperatorsLoading(true);
    const { data, error } = await fetchCompanyMembers(user.id);
    setOperatorsLoading(false);
    if (error) {
      setOperators([]);
      return;
    }
    setOperators(data);
    setSelectedOperatorName((prev) => {
      if (prev && data.some((m) => m.name === prev)) return prev;
      return data[0]?.name ?? null;
    });
  }, [user?.id]);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

  useFocusEffect(
    useCallback(() => {
      void loadOperators();
    }, [loadOperators]),
  );

  useEffect(() => {
    if (preset === 'transfer' || preset === 'tour' || preset === 'dayTour') {
      set_booking_kind(preset);
      setStep(2);
    }
  }, [preset]);

  useEffect(() => {
    if (booking_kind === 'dayTour' && days.length > 1) {
      setDays([initialItineraryDay(1)]);
    }
  }, [booking_kind, days.length]);

  const pax = Math.max(1, parseInt(passengers, 10) || 1);
  const price = useMemo(
    () => calcMockPrice({ type: booking_kind, passengers: pax, vehicleClass }),
    [booking_kind, pax, vehicleClass],
  );

  const clientGelParsed = useMemo(
    () => (booking_kind === 'transfer' ? parseAmountGeorgian(clientPriceStr) : 0),
    [booking_kind, clientPriceStr],
  );
  const commissionGelPreview = useMemo(
    () =>
      booking_kind === 'transfer'
        ? commissionGelAmount(clientGelParsed, commissionStr, commissionMode)
        : 0,
    [booking_kind, clientGelParsed, commissionStr, commissionMode],
  );
  const companyIncomePreview = useMemo(
    () => (booking_kind === 'transfer' ? Math.max(0, clientGelParsed - commissionGelPreview) : 0),
    [booking_kind, clientGelParsed, commissionGelPreview],
  );

  const previewVoucherId = useMemo(
    () => `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    [],
  );
  const companyName = useMemo(
    () => companyDisplayName(profile, user) ?? t('common.companyDefault'),
    [profile, user, t],
  );

  const paymentLabel = useCallback(
    (when: PaymentWhen) => t(`newBooking.payment.${when}`),
    [t],
  );

  function patchDay(index: number, patch: Partial<ItineraryDay>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function addDay() {
    if (booking_kind === 'dayTour') return;
    setDays((prev) => [...prev, initialItineraryDay(prev.length + 1)]);
  }

  function removeDay(index: number) {
    if (index === 0) return;
    setDays((prev) =>
      prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, day: i + 1 })),
    );
  }

  function validateStep2(): string | null {
    if (booking_kind === 'transfer') {
      if (transferTab === 'arrival') {
        if (!arrivalAirport.trim()) return t('newBooking.validation.airport');
        if (!arrivalDestination.trim()) return t('newBooking.validation.destination');
        if (!arrivalDateTime) return t('newBooking.validation.dateTime');
        return null;
      }
      if (!departureAddress.trim()) return t('newBooking.validation.hotel');
      if (!departureAirport.trim()) return t('newBooking.validation.airport');
      if (!departureDateTime) return t('newBooking.validation.departureDate');
      return null;
    }
    if (booking_kind === 'dayTour') {
      if (!bookingDateTime) return t('newBooking.validation.dateTime');
      const desc = tourRouteDescription.trim();
      const hasFrom = Boolean(days[0]?.from.trim());
      if (!desc && !hasFrom) {
        return t('newBooking.validation.tourRoute');
      }
      return null;
    }
    if (booking_kind === 'tour') {
      const desc = tourRouteDescription.trim();
      const hasStructured = days.some((d) => d.from.trim());
      if (!desc && !hasStructured) {
        return t('newBooking.validation.tourDays');
      }
      if (hasArrivalTransfer) {
        if (!transferInDateTime) return t('newBooking.validation.dateTime');
        if (!transferIn.flight.trim()) return t('newBooking.validation.flightNo');
        if (!transferIn.passengerName.trim()) return t('newBooking.validation.passengerName');
      }
      if (hasDepartureTransfer) {
        if (!transferOutDateTime) return t('newBooking.validation.departureDate');
        if (!transferOut.flight.trim()) return t('newBooking.validation.flightNo');
        if (!transferOut.passengerName.trim()) return t('newBooking.validation.passengerName');
      }
      return null;
    }
    return t('newBooking.validation.kind');
  }

  function resetWizard() {
    setStep(1);
    set_booking_kind('transfer');
    setTransferTab('arrival');
    setArrivalAirport('');
    setArrivalDestination('');
    setArrivalFlightNo('');
    setArrivalDateTime(null);
    setDepartureAddress('');
    setDepartureAirport('');
    setDepartureDateTime(null);
    setBookingDateTime(null);
    setPassengers('2');
    setVehicleClass('comfort');
    setSelectedVehicleType(VEHICLE_TYPES[0]);
    setDriverTargetMode('all');
    setSelectedDriverId(null);
    setMeetGreet(false);
    setSignText('');
    setPassengerName('');
    setPassengerPhone('');
    setClientPriceStr('');
    setCommissionStr('');
    setCommissionMode('gel');
    setComment('');
    setTourRouteDescription('');
    setDays([initialItineraryDay(1)]);
    setTransferIn(emptyTransferLeg());
    setTransferOut(emptyTransferLeg());
    setTransferInDateTime(null);
    setTransferOutDateTime(null);
    setHasArrivalTransfer(false);
    setHasDepartureTransfer(false);
    setPaymentWhen('now');
    setSelectedOperatorName(operators[0]?.name ?? null);
    setSubmitError(null);
  }

  function validateBeforeSave(): string | null {
    if (!normalizeVehicleType(selectedVehicleType)) {
      return t('newBooking.validation.vehicleType');
    }
    if (!normalizeVehicleClass(vehicleClass)) {
      return t('newBooking.validation.vehicleClass');
    }
    if (
      driverTargetMode === 'specific' &&
      matchingDrivers.length > 0 &&
      !selectedDriverId
    ) {
      return t('newBooking.validation.driverPick');
    }
    if (!passengers.trim() || pax < 1) {
      return t('newBooking.validation.passengers');
    }

    return validateStep2();
  }

  async function confirmAndSaveBooking() {
    if (!user?.id) {
      const sessionMsg = t('newBooking.validation.session');
      setSubmitError(sessionMsg);
      showErrorAlert(sessionMsg, t('system.sessionExpiredTitle'));
      return;
    }
    const operatorName = selectedOperatorName?.trim() || null;
    if (operators.length > 0 && !operatorName) {
      const operatorMsg = t('newBooking.validation.operator');
      setSubmitError(operatorMsg);
      showValidationAlert(operatorMsg);
      return;
    }

    const validationMessage = validateBeforeSave();
    if (validationMessage) {
      setSubmitError(validationMessage);
      showValidationAlert(validationMessage);
      return;
    }

    const dbKind = normalizeBookingKind(mapBookingType(booking_kind));

    setSubmitting(true);
    setSubmitError(null);
    const clientGel = booking_kind === 'transfer' ? parseAmountGeorgian(clientPriceStr) : 0;
    const commissionGelDb =
      booking_kind === 'transfer' && commissionStr.trim()
        ? commissionGelAmount(clientGel, commissionStr, commissionMode)
        : null;
    const isMultiDayTour = booking_kind === 'tour';
    const isDayTour = booking_kind === 'dayTour';
    const isTour = isMultiDayTour || isDayTour;
    const itineraryDb = isTour ? persistItineraryForDb(days) : null;
    const tourEnds = isTour ? tourEndpoints(itineraryDb ?? []) : { from: null, to: null };
    const transferInDb: TourTransferLeg | null =
      isMultiDayTour && hasArrivalTransfer
        ? transferLegOrNull({
            ...transferIn,
            date: transferInDateTime ? toIsoString(transferInDateTime) : '',
          })
        : null;
    const transferOutDb: TourTransferLeg | null =
      isMultiDayTour && hasDepartureTransfer
        ? transferLegOrNull({
            ...transferOut,
            date: transferOutDateTime ? toIsoString(transferOutDateTime) : '',
          })
        : null;
    const structuredRoute = isTour
      ? buildTourRouteDescription(days, (day, from, to) =>
          t('newBooking.dayLine', { day, from, to }),
        )
      : null;
    const descPart = tourRouteDescription.trim();
    const routeForDb =
      isTour ? [descPart, structuredRoute].filter(Boolean).join('\n\n') || null : null;

    const { error } = await insertBooking({
      company_id: user.id,
      company_name: companyDisplayName(profile, user) ?? t('common.companyDefault'),
      kind: dbKind,
      from_location:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalAirport.trim() || null
            : departureAddress.trim() || null
          : tourEnds.from,
      to_location:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalDestination.trim() || null
            : departureAirport.trim() || null
          : tourEnds.to,
      route: routeForDb,
      date_display: isDayTour
        ? bookingDateTime
          ? toIsoString(bookingDateTime)
          : null
        : isMultiDayTour
          ? tourBookingDateIso(
              hasArrivalTransfer ? transferInDateTime : null,
              hasDepartureTransfer ? transferOutDateTime : null,
            )
          : booking_kind === 'transfer'
            ? transferTab === 'arrival'
              ? arrivalDateTime
                ? toIsoString(arrivalDateTime)
                : null
              : departureDateTime
                ? toIsoString(departureDateTime)
                : null
            : bookingDateTime
              ? toIsoString(bookingDateTime)
              : null,
      passengers: pax,
      vehicle_type: selectedVehicleType,
      vehicle_class: vehicleClass,
      flight_number:
        booking_kind === 'transfer' && transferTab === 'arrival'
          ? arrivalFlightNo.trim() || null
          : null,
      meet_greet: booking_kind === 'transfer' ? meetGreet : false,
      sign_text:
        booking_kind === 'transfer' && meetGreet && signText.trim() ? signText.trim() : null,
      passenger_name: booking_kind === 'transfer' ? passengerName.trim() || null : null,
      passenger_phone: booking_kind === 'transfer' ? passengerPhone.trim() || null : null,
      flight_direction: booking_kind === 'transfer' ? transferTab : null,
      pickup_time: null,
      client_price: booking_kind === 'transfer' && clientGel > 0 ? clientGel : null,
      commission:
        booking_kind === 'transfer' && commissionGelDb !== null && commissionGelDb > 0
          ? commissionGelDb
          : null,
      tour_days: null,
      itinerary: itineraryDb,
      transfer_in: transferInDb,
      transfer_out: transferOutDb,
      comment: comment.trim() || null,
      payment_method: paymentWhen,
      price_gel: price,
      created_by_name: operatorName,
      driver_id:
        driverTargetMode === 'specific' && selectedDriverId ? selectedDriverId : null,
    });
    setSubmitting(false);
    if (error) {
      const message = mapSupabaseError(error);
      setSubmitError(message);
      showErrorAlert(message);
      return;
    }
    router.replace('/(app)/dashboard');
    resetWizard();
  }

  const bottomPad = insets.bottom + SPACING.xl + 8;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING.md, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppLogo size="auth" style={styles.logoImage} />
        <Text style={styles.title}>{t('newBooking.title')}</Text>
        <View style={styles.stepDots}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.dot, step >= s && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          {t('newBooking.step', {
            current: step,
            total: 3,
            name:
              step === 1
                ? t('newBooking.stepType')
                : step === 2
                  ? t('newBooking.stepDetails')
                  : t('newBooking.stepSummary'),
          })}
        </Text>

        <ServiceKindSelector value={booking_kind} onChange={set_booking_kind} />

        {step === 1 ? <Text style={styles.hint}>{t('newBooking.pickService')}</Text> : null}

        {step >= 2 ? (
          <OperatorPicker
            members={operators}
            loading={operatorsLoading}
            selectedName={selectedOperatorName}
            onSelect={setSelectedOperatorName}
          />
        ) : null}

        {step === 2 && booking_kind === 'transfer' && (
          <View style={styles.block}>
            <TransferSegmented tab={transferTab} onChange={setTransferTab} />

            <View style={styles.accordionPanel}>
              {transferTab === 'arrival' ? (
                <>
                  <AuthInput
                    label={t('newBooking.form.airport')}
                    value={arrivalAirport}
                    onChangeText={setArrivalAirport}
                    placeholder={t('newBooking.form.placeholders.airportExample')}
                  />
                  <AuthInput
                    label={t('newBooking.form.flightNo')}
                    value={arrivalFlightNo}
                    onChangeText={setArrivalFlightNo}
                    autoCapitalize="characters"
                    placeholder={t('newBooking.form.placeholders.flightExample')}
                  />
                  <DateTimeField
                    label={t('newBooking.form.dateTime')}
                    value={arrivalDateTime}
                    onChange={setArrivalDateTime}
                    placeholder={t('newBooking.form.placeholders.dateTime')}
                    minimumDate={new Date()}
                  />
                  <AuthInput
                    label={t('newBooking.form.destination')}
                    value={arrivalDestination}
                    onChangeText={setArrivalDestination}
                    placeholder={t('newBooking.form.placeholders.destinationExample')}
                  />
                </>
              ) : (
                <>
                  <AuthInput
                    label={t('newBooking.form.hotelAddress')}
                    value={departureAddress}
                    onChangeText={setDepartureAddress}
                    placeholder={t('newBooking.form.pickupPlace')}
                  />
                  <DateTimeField
                    label={t('newBooking.form.departureDateTime')}
                    value={departureDateTime}
                    onChange={setDepartureDateTime}
                    placeholder={t('newBooking.form.placeholders.dateTime')}
                    minimumDate={new Date()}
                  />
                  <AuthInput
                    label={t('newBooking.form.airport')}
                    value={departureAirport}
                    onChangeText={setDepartureAirport}
                    placeholder={t('newBooking.form.placeholders.airportExample')}
                  />
                </>
              )}
            </View>

            <View style={styles.compactDivider} />

            <AuthInput
              label={t('newBooking.form.passengers')}
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
            />
            <VehiclePicker
              selectedVehicleType={selectedVehicleType}
              onVehicleTypeChange={setSelectedVehicleType}
              vehicleClass={vehicleClass}
              onVehicleClassChange={setVehicleClass}
            />

            <View style={styles.compactRow}>
              <AuthInput
                label={t('newBooking.form.passengerName')}
                value={passengerName}
                onChangeText={setPassengerName}
              />
              <AuthInput
                label={t('newBooking.form.phone')}
                value={passengerPhone}
                onChangeText={setPassengerPhone}
                keyboardType="phone-pad"
              />
            </View>
            <Pressable
              onPress={() => setMeetGreet((v) => !v)}
              style={({ pressed }) => [
                styles.meetToggleCompact,
                meetGreet ? styles.meetToggleOn : styles.meetToggleOff,
                pressed && styles.pressed,
              ]}
            >
              <Text style={meetGreet ? styles.meetToggleTextOn : styles.meetToggleTextOff}>
                {t('newBooking.form.meetGreet')}
              </Text>
            </Pressable>
            {meetGreet ? (
              <AuthInput
                label={t('newBooking.form.signText')}
                value={signText}
                onChangeText={setSignText}
                placeholder={t('newBooking.form.placeholders.signName')}
              />
            ) : null}

            <Text style={styles.sectionHeader}>{t('newBooking.form.prices')}</Text>
            <AuthInput
              label={t('newBooking.form.clientPrice')}
              value={clientPriceStr}
              onChangeText={setClientPriceStr}
              keyboardType="decimal-pad"
              placeholder={t('newBooking.form.placeholders.zero')}
            />
            <Text style={styles.fieldLabel}>{t('newBooking.form.commission')}</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setCommissionMode('gel')}
                style={[styles.chip, commissionMode === 'gel' && styles.chipActive]}
              >
                <Text style={[styles.chipText, commissionMode === 'gel' && styles.chipTextActive]}>
                  ₾
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setCommissionMode('percent')}
                style={[styles.chip, commissionMode === 'percent' && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, commissionMode === 'percent' && styles.chipTextActive]}
                >
                  %
                </Text>
              </Pressable>
            </View>
            <AuthInput
              label={
                commissionMode === 'gel'
                  ? t('newBooking.form.commissionGel')
                  : t('newBooking.form.commissionPct')
              }
              value={commissionStr}
              onChangeText={setCommissionStr}
              keyboardType="decimal-pad"
              placeholder={
                commissionMode === 'gel'
                  ? t('newBooking.form.placeholders.zero')
                  : t('newBooking.form.placeholders.commissionPctExample')
              }
            />
            {clientGelParsed > 0 ? (
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>{t('newBooking.form.yourIncome')}</Text>
                <Text style={styles.incomeValue}>{formatGel(companyIncomePreview)}</Text>
              </View>
            ) : (
              <Text style={styles.incomeHint}>{t('newBooking.form.incomeHint')}</Text>
            )}
            <Text style={styles.driverPayNote}>
              {t('newBooking.form.driverPayInline', { amount: formatGel(price) })}
            </Text>

            <Text style={styles.sectionHeader}>{t('newBooking.form.note')}</Text>
            <AuthInput
              label={t('newBooking.form.comment')}
              value={comment}
              onChangeText={setComment}
              multiline
              style={styles.textArea}
            />
          </View>
        )}

        {step === 2 && booking_kind === 'dayTour' && (
          <View style={styles.block}>
            <Text style={styles.dayTourTitle}>{t('newBooking.form.dayTourDetails')}</Text>

            <AuthInput
              label={t('newBooking.form.tourDescription')}
              value={tourRouteDescription}
              onChangeText={setTourRouteDescription}
              multiline
              style={styles.textArea}
              placeholder={t('newBooking.form.placeholders.dayTourDesc')}
            />

            <DateTimeField
              label={t('newBooking.form.dateTime')}
              value={bookingDateTime}
              onChange={setBookingDateTime}
              placeholder={t('newBooking.form.placeholders.dateTime')}
              minimumDate={new Date()}
            />
            <AuthInput
              label={t('newBooking.form.passengers')}
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
            />

            <View style={styles.dayTourCard}>
              <AuthInput
                label={t('newBooking.form.from')}
                value={days[0]?.from ?? ''}
                onChangeText={(text) => patchDay(0, { from: text })}
              />
              <AuthInput
                label={t('newBooking.form.to')}
                value={days[0]?.to ?? ''}
                onChangeText={(text) => patchDay(0, { to: text })}
              />
              <AuthInput
                label={t('newBooking.form.stops')}
                value={days[0]?.stops ?? ''}
                onChangeText={(text) => patchDay(0, { stops: text })}
                placeholder={t('newBooking.form.placeholders.stopsExample')}
                multiline
                style={styles.textArea}
              />
            </View>

            <VehiclePicker
              selectedVehicleType={selectedVehicleType}
              onVehicleTypeChange={setSelectedVehicleType}
              vehicleClass={vehicleClass}
              onVehicleClassChange={setVehicleClass}
            />

            <Text style={styles.sectionHeader}>{t('newBooking.form.note')}</Text>
            <AuthInput
              label={t('newBooking.form.comment')}
              value={comment}
              onChangeText={setComment}
              multiline
              style={styles.textArea}
            />
          </View>
        )}

        {step === 2 && booking_kind === 'tour' && (
          <View style={styles.block}>
            <AuthInput
              label={t('newBooking.form.tourDescription')}
              value={tourRouteDescription}
              onChangeText={setTourRouteDescription}
              multiline
              style={styles.textArea}
              placeholder={t('newBooking.form.placeholders.multiDayTourDesc')}
            />

            <OptionalTransferToggle
              label={t('newBooking.form.optionalArrivalTransfer')}
              value={hasArrivalTransfer}
              onChange={setHasArrivalTransfer}
            />
            {hasArrivalTransfer ? (
              <>
                <Text style={styles.sectionHeader}>{t('newBooking.form.transferArrivalSection')}</Text>
                <DateTimeField
                  label={t('newBooking.form.dateTime')}
                  value={transferInDateTime}
                  onChange={setTransferInDateTime}
                  placeholder={t('newBooking.form.placeholders.dateTime')}
                  minimumDate={new Date()}
                />
                <AuthInput
                  label={t('newBooking.form.flightNo')}
                  value={transferIn.flight}
                  onChangeText={(text) => setTransferIn((p) => ({ ...p, flight: text }))}
                  autoCapitalize="characters"
                  placeholder={t('newBooking.form.placeholders.flightExample')}
                />
                <AuthInput
                  label={t('newBooking.form.passengerFullName')}
                  value={transferIn.passengerName}
                  onChangeText={(text) => setTransferIn((p) => ({ ...p, passengerName: text }))}
                  placeholder={t('newBooking.form.placeholders.signName')}
                />
              </>
            ) : null}

            <Text style={styles.sectionHeader}>{t('newBooking.form.tourDays')}</Text>
            {days.map((day, dayIndex) => (
              <View key={`day-${day.day}-${dayIndex}`} style={styles.tourDayBlock}>
                <View style={styles.tourDayHeaderRow}>
                  <Text style={styles.tourDayTitle}>
                    {t('newBooking.form.dayN', { n: day.day })}
                  </Text>
                  {dayIndex > 0 ? (
                    <Pressable
                      onPress={() => removeDay(dayIndex)}
                      hitSlop={10}
                      accessibilityLabel={t('newBooking.form.removeDayA11y')}
                      style={({ pressed }) => [styles.tourDayRemoveBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.tourDayRemoveText}>{t('newBooking.form.removeDay')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <AuthInput
                  label={t('newBooking.form.from')}
                  value={day.from}
                  onChangeText={(text) => patchDay(dayIndex, { from: text })}
                />
                <AuthInput
                  label={t('newBooking.form.to')}
                  value={day.to}
                  onChangeText={(text) => patchDay(dayIndex, { to: text })}
                />
                <AuthInput
                  label={t('newBooking.form.stops')}
                  value={day.stops}
                  onChangeText={(text) => patchDay(dayIndex, { stops: text })}
                  placeholder={t('newBooking.form.placeholders.stopsExample')}
                  multiline
                  style={styles.textArea}
                />
              </View>
            ))}
            {booking_kind === 'tour' ? (
              <Pressable
                onPress={addDay}
                style={({ pressed }) => [styles.addDayOutline, pressed && styles.pressed]}
              >
                <Text style={styles.addDayOutlineText}>{t('newBooking.form.addDay')}</Text>
              </Pressable>
            ) : null}

            <OptionalTransferToggle
              label={t('newBooking.form.optionalDepartureTransfer')}
              value={hasDepartureTransfer}
              onChange={setHasDepartureTransfer}
            />
            {hasDepartureTransfer ? (
              <>
                <Text style={styles.sectionHeader}>{t('newBooking.form.transferDepartureSection')}</Text>
                <DateTimeField
                  label={t('newBooking.form.dateTime')}
                  value={transferOutDateTime}
                  onChange={setTransferOutDateTime}
                  placeholder={t('newBooking.form.placeholders.dateTime')}
                  minimumDate={new Date()}
                />
                <AuthInput
                  label={t('newBooking.form.flightNo')}
                  value={transferOut.flight}
                  onChangeText={(text) => setTransferOut((p) => ({ ...p, flight: text }))}
                  autoCapitalize="characters"
                  placeholder={t('newBooking.form.placeholders.flightExample')}
                />
                <AuthInput
                  label={t('newBooking.form.passengerFullName')}
                  value={transferOut.passengerName}
                  onChangeText={(text) => setTransferOut((p) => ({ ...p, passengerName: text }))}
                  placeholder={t('newBooking.form.placeholders.signName')}
                />
              </>
            ) : null}

            <AuthInput
              label={t('newBooking.form.passengers')}
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
            />
            <VehiclePicker
              selectedVehicleType={selectedVehicleType}
              onVehicleTypeChange={setSelectedVehicleType}
              vehicleClass={vehicleClass}
              onVehicleClassChange={setVehicleClass}
            />

            <Text style={styles.sectionHeader}>{t('newBooking.form.note')}</Text>
            <AuthInput
              label={t('newBooking.form.comment')}
              value={comment}
              onChangeText={setComment}
              multiline
            />
          </View>
        )}

        {step === 3 && (
          <View style={styles.block}>
            <View style={styles.priceBox}>
              {booking_kind === 'transfer' ? (
                <>
                  <Text style={styles.priceLabel}>{t('newBooking.form.driverPayLabel')}</Text>
                  <Text style={styles.priceBig}>{formatGel(price)}</Text>
                  {clientGelParsed > 0 ? (
                    <>
                      <View style={styles.priceSplit}>
                        <Text style={styles.priceSubLabel}>{t('newBooking.form.clientPriceShort')}</Text>
                        <Text style={styles.priceSubValue}>{formatGel(clientGelParsed)}</Text>
                      </View>
                      {commissionGelPreview > 0 ? (
                        <View style={styles.priceSplit}>
                          <Text style={styles.priceSubLabel}>{t('newBooking.form.commissionGel')}</Text>
                          <Text style={styles.priceSubValue}>{formatGel(commissionGelPreview)}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.priceSplit, styles.priceIncomeRow]}>
                        <Text style={styles.priceIncomeLabel}>{t('newBooking.form.yourIncome')}</Text>
                        <Text style={styles.priceIncomeValue}>{formatGel(companyIncomePreview)}</Text>
                      </View>
                    </>
                  ) : null}
                  <Text style={styles.priceNote}>
                    {t('newBooking.form.finalPriceNote', {
                      pax,
                      class: vehicleClassLabel(vehicleClass),
                    })}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.priceLabel}>{t('newBooking.form.estimatedPrice')}</Text>
                  <Text style={styles.priceBig}>{formatGel(price)}</Text>
                  <Text style={styles.priceNote}>
                    {t('newBooking.form.estimatedPriceNote', {
                      pax,
                      class: vehicleClassLabel(vehicleClass),
                    })}
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.fieldLabel}>{t('newBooking.form.paymentMethod')}</Text>
            {PAYMENT_OPTIONS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPaymentWhen(p)}
                style={[styles.payRow, paymentWhen === p && styles.payRowActive]}
              >
                <Text style={[styles.payText, paymentWhen === p && styles.payTextActive]}>
                  {paymentLabel(p)}
                </Text>
              </Pressable>
            ))}
            <View style={[styles.voucher, SHADOWS.gold, styles.voucherSpaced]}>
              <Text style={styles.voucherTitle}>{t('newBooking.form.voucherTitle')}</Text>
              <Text style={styles.voucherId}>{previewVoucherId}</Text>
              <View style={styles.vDivider} />
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherCompany')}: {companyName}
              </Text>
              {selectedOperatorName?.trim() ? (
                <Text style={styles.vLine}>
                  {t('newBooking.form.voucherOperator')}: {selectedOperatorName.trim()}
                </Text>
              ) : null}
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherType')}: {bookingKindUiLabel(booking_kind, transferTab)}
              </Text>
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherVehicle')}: {vehicleTypeLabel(selectedVehicleType)}
              </Text>
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherClass')}: {vehicleClassLabel(vehicleClass)}
              </Text>
              {(booking_kind === 'tour' || booking_kind === 'dayTour') &&
              tourRouteDescription.trim() ? (
                <Text style={styles.vLineMuted}>
                  {t('newBooking.form.voucherTourDesc')}: {tourRouteDescription.trim()}
                </Text>
              ) : null}
              {booking_kind === 'transfer' ? (
                <>
                  <Text style={styles.vLine}>
                    {transferTab === 'arrival'
                      ? t('newBooking.form.voucherArrival')
                      : t('newBooking.form.voucherDeparture')}
                  </Text>
                  <Text style={styles.vLine}>
                    {transferTab === 'arrival'
                      ? `${arrivalAirport || '—'} → ${arrivalDestination || '—'}`
                      : `${departureAddress || '—'} → ${departureAirport || '—'}`}
                  </Text>
                  {transferTab === 'arrival' && arrivalDateTime ? (
                    <Text style={styles.vLine}>{formatDisplayDateTime(arrivalDateTime)}</Text>
                  ) : null}
                  {transferTab === 'departure' && departureDateTime ? (
                    <Text style={styles.vLine}>{formatDisplayDateTime(departureDateTime)}</Text>
                  ) : null}
                  {transferTab === 'arrival' && arrivalFlightNo.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherFlight')}: {arrivalFlightNo.trim()}
                    </Text>
                  ) : null}
                  {passengerName.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherPassenger')}: {passengerName.trim()}
                    </Text>
                  ) : null}
                </>
              ) : booking_kind === 'dayTour' ? (
                <>
                  <Text style={styles.vLine}>
                    {days[0]?.from.trim() || '—'} → {days[0]?.to.trim() || '—'}
                  </Text>
                  {bookingDateTime ? (
                    <Text style={styles.vLineMuted}>{formatDisplayDateTime(bookingDateTime)}</Text>
                  ) : null}
                  {days[0]?.stops.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherStops')}: {days[0].stops.trim()}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  {hasArrivalTransfer && (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherTransferInDetail', {
                        datetime: transferInDateTime
                          ? formatDisplayDateTime(transferInDateTime)
                          : '—',
                        flight: transferIn.flight.trim() || '—',
                        passenger: transferIn.passengerName.trim() || '—',
                      })}
                    </Text>
                  )}
                  {days.map((d) => (
                    <Text key={`preview-day-${d.day}`} style={styles.vLineMuted}>
                      {d.stops.trim()
                        ? t('newBooking.form.voucherDayRouteWithStops', {
                            day: d.day,
                            from: d.from.trim() || '—',
                            to: d.to.trim() || '—',
                            stops: d.stops.trim(),
                          })
                        : t('newBooking.dayLine', {
                            day: d.day,
                            from: d.from.trim() || '—',
                            to: d.to.trim() || '—',
                          })}
                    </Text>
                  ))}
                  {hasDepartureTransfer && (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherTransferOutDetail', {
                        datetime: transferOutDateTime
                          ? formatDisplayDateTime(transferOutDateTime)
                          : '—',
                        flight: transferOut.flight.trim() || '—',
                        passenger: transferOut.passengerName.trim() || '—',
                      })}
                    </Text>
                  )}
                </>
              )}
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherPassengers')}: {pax}
              </Text>
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherPayment')}: {paymentLabel(paymentWhen)}
              </Text>
              {booking_kind === 'transfer' && clientGelParsed > 0 ? (
                <>
                  <Text style={styles.vLineMuted}>
                    {t('newBooking.form.voucherClientPrice')}: {formatGel(clientGelParsed)}
                  </Text>
                  {commissionGelPreview > 0 ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherCommission')}: {formatGel(commissionGelPreview)}
                    </Text>
                  ) : null}
                  <Text style={styles.vLineMuted}>
                    {t('newBooking.form.voucherIncome')}: {formatGel(companyIncomePreview)}
                  </Text>
                </>
              ) : null}
              <Text style={styles.vPrice}>
                {t('newBooking.form.voucherDriver')}: {formatGel(price)}
              </Text>
            </View>

            <MatchingDriversSection
              active
              vehicleType={selectedVehicleType}
              vehicleClass={vehicleClass}
              driverTargetMode={driverTargetMode}
              onDriverTargetModeChange={setDriverTargetMode}
              selectedDriverId={selectedDriverId}
              onSelectDriver={setSelectedDriverId}
              onDriversLoaded={setMatchingDrivers}
            />

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <Pressable
              onPress={() => void confirmAndSaveBooking()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.btnPrimary,
                styles.confirmSubmitBtn,
                (pressed || submitting) && styles.pressed,
                submitting && styles.btnDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t('newBooking.submit')}</Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.navRow}>
          {step > 1 && (
            <Pressable
              onPress={() => setStep((s) => Math.max(1, s - 1))}
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.btnSecondaryText}>{t('common.back')}</Text>
            </Pressable>
          )}
          {step < 3 && (
            <Pressable
              onPress={() => {
                if (step === 2) {
                  const step2Error = validateStep2();
                  if (step2Error) {
                    showValidationAlert(step2Error);
                    return;
                  }
                }
                setStep((s) => Math.min(3, s + 1));
              }}
              style={({ pressed }) => [
                styles.btnPrimary,
                step === 1 && styles.btnPrimarySolo,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.btnPrimaryText}>{t('common.next')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    flexGrow: 1,
  },
  logoImage: {
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.gold,
  },
  stepLabel: {
    color: COLORS.grayLight,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    fontSize: 14,
  },
  block: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.grayLight,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  sectionHeaderFirst: {
    marginTop: 0,
  },
  operatorBlock: {
    marginBottom: SPACING.md,
    marginTop: 0,
  },
  operatorHint: {
    color: COLORS.gray,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.button,
    padding: 4,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: RADIUS.input,
    position: 'relative',
  },
  segmentItemActive: {
    backgroundColor: COLORS.white,
    ...SHADOWS.card,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.text,
    fontWeight: '800',
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 2,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 1,
  },
  accordionPanel: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  compactDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  compactRow: {
    gap: 0,
  },
  meetToggleCompact: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  meetToggle: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  meetToggleOff: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.surface,
  },
  meetToggleOn: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold,
  },
  meetToggleTextOff: {
    color: COLORS.goldLight,
    fontWeight: '800',
    fontSize: 15,
  },
  meetToggleTextOn: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  incomeLabel: {
    color: COLORS.grayLight,
    fontSize: 14,
    fontWeight: '700',
  },
  incomeValue: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: '800',
  },
  incomeHint: {
    color: COLORS.gray,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  driverPayNote: {
    color: COLORS.gray,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: SPACING.xs,
  },
  dayTourTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: SPACING.lg,
  },
  dayTourCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  tourDayBlock: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  tourDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  tourDayTitle: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '800',
  },
  tourDayRemoveBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  tourDayRemoveText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '700',
  },
  addDayOutline: {
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  addDayOutlineText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
  },
  priceSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  priceSubLabel: {
    color: COLORS.gray,
    fontSize: 13,
  },
  priceSubValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  priceIncomeRow: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  priceIncomeLabel: {
    color: COLORS.goldLight,
    fontSize: 14,
    fontWeight: '800',
  },
  priceIncomeValue: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
  },
  typeCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  typeCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  typeTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  typeTitleActive: {
    color: COLORS.goldLight,
  },
  hint: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  fieldLabel: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.15)',
  },
  chipText: {
    color: COLORS.grayLight,
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextActive: {
    color: COLORS.gold,
  },
  matchingDriversBlock: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  driversSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  driverCountBadge: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  driversNoMatchBox: {
    backgroundColor: COLORS.goldTint,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  driversNoMatchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  driversNoMatchBody: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  confirmSubmitBtn: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  matchingDriversLoader: {
    marginVertical: SPACING.md,
  },
  matchingDriversEmpty: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  driverTargetRow: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  driverTargetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  driverTargetOptionActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: COLORS.gold,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gold,
  },
  driverTargetLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  driverTargetLabelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  driverCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
    ...SHADOWS.cardStrong,
  },
  driverCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  driverCardTop: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceAlt,
  },
  driverAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  driverAvatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.gold,
  },
  driverCardMain: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  driverVehicleLineMuted: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  driverRating: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  driverVehicleLine: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  driverMetaLine: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 2,
  },
  driverChooseBtn: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
  },
  driverChooseBtnSelected: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  driverChooseBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.gold,
  },
  driverChooseBtnTextSelected: {
    color: COLORS.black,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  priceBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  priceLabel: {
    color: COLORS.gray,
    fontSize: 13,
  },
  priceBig: {
    color: COLORS.gold,
    fontSize: 32,
    fontWeight: '800',
    marginVertical: SPACING.sm,
  },
  priceNote: {
    color: COLORS.grayLight,
    fontSize: 13,
    lineHeight: 18,
  },
  payRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  payRowActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.1)',
  },
  payText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  payTextActive: {
    color: COLORS.goldLight,
  },
  voucher: {
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  voucherSpaced: {
    marginTop: SPACING.lg,
  },
  voucherTitle: {
    color: COLORS.gray,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  voucherId: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  vDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  vLine: {
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 6,
  },
  vLineMuted: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginBottom: 6,
  },
  vPrice: {
    color: COLORS.gold,
    fontSize: 22,
    fontWeight: '800',
    marginTop: SPACING.sm,
  },
  doneHint: {
    color: COLORS.grayLight,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 20,
  },
  submitError: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  btnDisabled: {
    opacity: 0.85,
  },
  serviceKindWrap: {
    marginBottom: SPACING.lg,
  },
  serviceKindSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
    color: COLORS.gold,
  },
  serviceKindRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'stretch',
  },
  serviceKindBtn: {
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: 4,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  serviceKindBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    ...SHADOWS.gold,
  },
  serviceKindBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  serviceKindBtnTextActive: {
    color: COLORS.goldDark,
    fontWeight: '800',
  },
  navRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  btnSecondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  btnSecondaryText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 16,
  },
  btnPrimary: {
    flex: 2,
    borderRadius: 14,
    backgroundColor: COLORS.gold,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimarySolo: {
    flex: 1,
  },
  btnPrimaryText: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.9,
  },
});
