import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { AppLogo } from '../../components/AppLogo';
import { NameWithVerifiedBadge } from '../../components/NameWithVerifiedBadge';
import { UserAvatar } from '../../components/UserAvatar';
import { SearchableCitySelect } from '../../components/SearchableCitySelect';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  insertBooking,
  setBookingPickupSignLogoUrl,
  uploadPickupSignLogo,
  type PickupSignLogoFile,
} from '../../lib/bookings';
import {
  calcSmartEstimate,
  composeInsertBookingInput,
  emptyServiceFlags,
  isPureTransfer,
  parseAmountGeorgian,
  serviceFlagsFromPreset,
  validateSmartBookingStep1,
  validateSmartBookingStep2,
  type CommissionMode,
  type ServiceFlags,
} from '../../lib/bookingCompose';
import { ArrivalTransferSection } from '../../components/newBooking/ArrivalTransferSection';
import { BookingSummaryStep } from '../../components/newBooking/BookingSummaryStep';
import { DepartureTransferSection } from '../../components/newBooking/DepartureTransferSection';
import { ServiceCheckboxStep } from '../../components/newBooking/ServiceCheckboxStep';
import { TourItinerarySection } from '../../components/newBooking/TourItinerarySection';
import { TransferExtrasSection } from '../../components/newBooking/TransferExtrasSection';
import { PickupSignLogoField } from '../../components/PickupSignLogoField';
import {
  emptyLocationValue,
  type LocationValue,
} from '../../lib/bookingLocations';
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
import {
  generateTourDaysFromRange,
  type TourDayForm,
} from '../../lib/tourDays';
import { DriverCategorySelect } from '../../components/DriverCategorySelect';
import { fetchMatchingDrivers, type MatchingDriver } from '../../lib/drivers';
import type { RequestedDriverCategory } from '../../lib/driverCategory';
import { formatSpokenLanguagesList } from '../../lib/spokenLanguages';
import { LanguageMultiSelect } from '../../components/LanguageMultiSelect';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { User } from '@supabase/supabase-js';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
type PaymentWhen = 'now' | 'later' | 'clientCard';

const PAYMENT_OPTIONS: PaymentWhen[] = ['now', 'later', 'clientCard'];

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function mapPickupSignLogoError(
  err: Error | null | undefined,
  t: (key: string) => string,
): string {
  if (!err) return t('newBooking.pickupSignLogo.uploadFailed');
  const msg = err.message;
  if (msg === 'pickupSignLogo.invalidType') return t('newBooking.pickupSignLogo.invalidType');
  if (msg === 'pickupSignLogo.tooLarge') return t('newBooking.pickupSignLogo.tooLarge');
  if (msg.startsWith('pickupSignLogo.')) return t('newBooking.pickupSignLogo.uploadFailed');
  return msg;
}

function companyDisplayName(profile: Profile | null, user: User | null) {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? null;
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
  return formatSpokenLanguagesList(languages);
}

function matchingDriverVehicleLine(
  vehicle: MatchingDriver['vehicle'],
  seatsLabel: (count: number) => string,
): string {
  if (!vehicle) return '';
  const typeClass = [
    vehicle.type ? vehicleTypeLabel(normalizeVehicleType(vehicle.type)) : null,
    vehicle.class ? vehicleClassLabel(normalizeVehicleClass(vehicle.class)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const parts: string[] = [];
  if (typeClass) parts.push(typeClass);
  if (vehicle.passenger_capacity != null && vehicle.passenger_capacity > 0) {
    parts.push(seatsLabel(vehicle.passenger_capacity));
  }
  if (vehicle.model?.trim()) parts.push(vehicle.model.trim());
  if (vehicle.year != null) parts.push(String(vehicle.year));
  if (vehicle.plate?.trim()) parts.push(vehicle.plate.trim());
  const head = parts.join(' — ');
  if (vehicle.color?.trim()) {
    return head ? `${head}, ${vehicle.color.trim()}` : vehicle.color.trim();
  }
  return head;
}

function MatchingDriversSection({
  active,
  vehicleType,
  vehicleClass,
  requiredLanguages,
  driverCategory,
  driverTargetMode,
  onDriverTargetModeChange,
  selectedDriverId,
  selectedDriverVehicleId,
  onSelectDriver,
  onDriversLoaded,
  minPassengerCapacity,
  filterByMinSeats,
  onFilterByMinSeatsChange,
}: {
  active: boolean;
  vehicleType: VehicleTypeCode;
  vehicleClass: VehicleClassCode;
  requiredLanguages: string[];
  driverCategory: RequestedDriverCategory;
  driverTargetMode: DriverTargetMode;
  onDriverTargetModeChange: (mode: DriverTargetMode) => void;
  selectedDriverId: string | null;
  selectedDriverVehicleId: string | null;
  onSelectDriver: (id: string | null, vehicleId: string | null) => void;
  onDriversLoaded?: (drivers: MatchingDriver[]) => void;
  minPassengerCapacity: number;
  filterByMinSeats: boolean;
  onFilterByMinSeatsChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
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

    void fetchMatchingDrivers(
      vehicleType,
      vehicleClass,
      requiredLanguages,
      cityFilter,
      driverCategory,
      filterByMinSeats && minPassengerCapacity > 0 ? minPassengerCapacity : null,
    ).then(({ data, error }) => {
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
        onSelectDriver(null, null);
      } else if (selectedDriverId && !data.some((d) => d.id === selectedDriverId)) {
        onSelectDriver(null, null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    active,
    vehicleType,
    vehicleClass,
    normType,
    normClass,
    requiredLanguages,
    cityFilter,
    driverCategory,
    minPassengerCapacity,
    filterByMinSeats,
  ]);

  if (!active || !normType || !normClass) {
    return null;
  }

  const driverCountLabel = loading ? '…' : String(drivers.length);

  return (
    <View style={styles.matchingDriversBlock}>
      <Text style={styles.driversSectionTitle}>{t('newBooking.drivers')}</Text>

      <SearchableCitySelect
        label={t('newBooking.filterByCity')}
        value={cityFilter}
        onChange={setCityFilter}
        allowEmpty
      />

      {minPassengerCapacity > 0 ? (
        <Pressable
          onPress={() => onFilterByMinSeatsChange(!filterByMinSeats)}
          style={({ pressed }) => [
            styles.minSeatsFilterRow,
            filterByMinSeats && styles.minSeatsFilterRowActive,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.radioOuter, filterByMinSeats && styles.radioOuterActive]}>
            {filterByMinSeats ? <View style={styles.radioInner} /> : null}
          </View>
          <Text style={styles.minSeatsFilterLabel}>
            {t('newBooking.filterMinSeats', { count: minPassengerCapacity })}
          </Text>
        </Pressable>
      ) : null}

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
                onSelectDriver(null, null);
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
                const vehicleLine = matchingDriverVehicleLine(driver.vehicle, (count) =>
                  t('newBooking.vehicleSeats', { count }),
                );
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
                    onPress={() =>
                      onSelectDriver(
                        selected ? null : driver.id,
                        selected ? null : driver.vehicle?.id ?? null,
                      )
                    }
                    style={({ pressed }) => [
                      styles.driverCard,
                      selected && styles.driverCardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.driverCardTop}>
                      <View style={styles.driverCardPhotos}>
                        <UserAvatar name={driver.full_name} uri={driver.avatar_url} size={52} />
                        {driver.vehicle?.photo_front ? (
                          <Image
                            source={{ uri: driver.vehicle.photo_front }}
                            style={styles.driverVehicleThumb}
                            resizeMode="cover"
                          />
                        ) : null}
                      </View>
                      <View style={styles.driverCardMain}>
                        <NameWithVerifiedBadge
                          name={driver.full_name || t('driver.defaultName')}
                          verified={driver.is_verified}
                          isGuide={driver.is_guide_driver}
                          textStyle={styles.driverName}
                          numberOfLines={1}
                        />
                        {vehicleLine ? (
                          <Text style={styles.driverVehicleLine}>🚗 {vehicleLine}</Text>
                        ) : (
                          <Text style={styles.driverVehicleLineMuted}>{t('newBooking.noVehicle')}</Text>
                        )}
                        {driver.city ? (
                          <Text style={styles.driverMetaLine}>📍 {driver.city}</Text>
                        ) : null}
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

// ─── Reusable inline dropdown (no external deps) ───────────────────────────
function InlineDropdown<T extends string>({
  label,
  value,
  options,
  labelFor,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelFor: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.ddWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.ddTrigger, pressed && styles.pressed]}
      >
        <Text style={styles.ddTriggerText}>{labelFor(value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gold} />
      </Pressable>
      {open && (
        <View style={styles.ddList}>
          {options.map((opt) => {
            const active = opt === value;
            return (
              <Pressable
                key={opt}
                onPress={() => { onChange(opt); setOpen(false); }}
                style={({ pressed }) => [styles.ddItem, active && styles.ddItemActive, pressed && styles.pressed]}
              >
                <Text style={[styles.ddItemText, active && styles.ddItemTextActive]}>
                  {labelFor(opt)}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color={COLORS.gold} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Passenger stepper ──────────────────────────────────────────────────────
function PassengerStepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const num = Math.max(1, parseInt(value, 10) || 1);
  return (
    <View style={styles.stepperWrapper}>
      <Text style={styles.fieldLabel}>{t('newBooking.form.passengers')}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onChange(String(Math.max(1, num - 1)))}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
        >
          <Ionicons name="remove" size={20} color={COLORS.gold} />
        </Pressable>
        <Text style={styles.stepperValue}>{num}</Text>
        <Pressable
          onPress={() => onChange(String(Math.min(50, num + 1)))}
          style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={COLORS.gold} />
        </Pressable>
      </View>
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
      <InlineDropdown
        label={t('newBooking.form.vehicleType')}
        value={selectedVehicleType}
        options={VEHICLE_TYPES}
        labelFor={vehicleTypeLabel}
        onChange={onVehicleTypeChange}
      />
      <InlineDropdown
        label={t('newBooking.form.vehicleClass')}
        value={vehicleClass}
        options={VEHICLE_CLASSES}
        labelFor={vehicleClassLabel}
        onChange={onVehicleClassChange}
      />
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
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [serviceFlags, setServiceFlags] = useState<ServiceFlags>(() => emptyServiceFlags());

  const [arrivalFlightNo, setArrivalFlightNo] = useState('');
  const [departureFlightNo, setDepartureFlightNo] = useState('');
  const [passengers, setPassengers] = useState('2');
  const [vehicleClass, setVehicleClass] = useState<VehicleClassCode>('comfort');
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleTypeCode>(VEHICLE_TYPES[0]);
  const [driverTargetMode, setDriverTargetMode] = useState<DriverTargetMode>('all');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDriverVehicleId, setSelectedDriverVehicleId] = useState<string | null>(null);
  const [matchingDrivers, setMatchingDrivers] = useState<MatchingDriver[]>([]);
  const [filterByMinSeats, setFilterByMinSeats] = useState(true);
  const [requiredLanguages, setRequiredLanguages] = useState<string[]>([]);
  const [driverCategory, setDriverCategory] = useState<RequestedDriverCategory>('all');

  useEffect(() => {
    selectDriver(null, null);
    setDriverTargetMode('all');
  }, [selectedVehicleType, vehicleClass, requiredLanguages, driverCategory]);

  function selectDriver(driverId: string | null, vehicleId: string | null) {
    setSelectedDriverId(driverId);
    setSelectedDriverVehicleId(vehicleId);
  }

  const [meetGreet, setMeetGreet] = useState(false);
  const [signText, setSignText] = useState('');
  const [pickupSignLogo, setPickupSignLogo] = useState<PickupSignLogoFile | null>(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [clientPriceStr, setClientPriceStr] = useState('');
  const [commissionStr, setCommissionStr] = useState('');
  const [commissionMode, setCommissionMode] = useState<CommissionMode>('gel');
  const [comment, setComment] = useState('');

  const [transferInDateTime, setTransferInDateTime] = useState<Date | null>(null);
  const [transferOutDateTime, setTransferOutDateTime] = useState<Date | null>(null);
  const [tourStartDate, setTourStartDate] = useState<Date | null>(null);
  const [tourEndDate, setTourEndDate] = useState<Date | null>(null);
  const [tourDays, setTourDays] = useState<TourDayForm[]>([]);
  const [transferInAirportLoc, setTransferInAirportLoc] = useState<LocationValue>(() => ({
    type: 'airport',
    name: '',
  }));
  const [transferInHotelLoc, setTransferInHotelLoc] = useState<LocationValue>(() => emptyLocationValue());
  const [transferOutAirportLoc, setTransferOutAirportLoc] = useState<LocationValue>(() => ({
    type: 'airport',
    name: '',
  }));
  const [transferOutHotelLoc, setTransferOutHotelLoc] = useState<LocationValue>(() => emptyLocationValue());

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
    const fromPreset = serviceFlagsFromPreset(preset);
    if (fromPreset) {
      setServiceFlags(fromPreset);
      setStep(2);
      if (preset === 'dayTour') {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        setTourStartDate(today);
        setTourEndDate(today);
      }
    }
  }, [preset]);

  useEffect(() => {
    if (!serviceFlags.wantTour) return;
    if (!tourStartDate || !tourEndDate) {
      setTourDays([]);
      return;
    }
    setTourDays((prev) => generateTourDaysFromRange(tourStartDate, tourEndDate, prev));
  }, [serviceFlags.wantTour, tourStartDate, tourEndDate]);

  const pax = Math.max(1, parseInt(passengers, 10) || 1);
  const estimateGel = useMemo(
    () => calcSmartEstimate(serviceFlags, pax, vehicleClass),
    [serviceFlags, pax, vehicleClass],
  );

  const offeredGelParsed = useMemo(
    () => parseAmountGeorgian(clientPriceStr),
    [clientPriceStr],
  );
  const driverOfferGel = offeredGelParsed > 0 ? offeredGelParsed : estimateGel;

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

  function patchTourDay(index: number, patch: Partial<TourDayForm>) {
    setTourDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  const legState = useMemo(
    () => ({
      transferInDateTime,
      transferInAirportLoc,
      transferInHotelLoc,
      arrivalFlightNo,
      transferOutDateTime,
      transferOutHotelLoc,
      transferOutAirportLoc,
      departureFlightNo,
      tourStartDate,
      tourEndDate,
      tourDays,
      meetGreet,
      signText,
      passengerName,
      passengerPhone,
      passengers,
      comment,
      clientPriceStr,
      commissionStr,
      commissionMode,
      paymentWhen,
    }),
    [
      transferInDateTime,
      transferInAirportLoc,
      transferInHotelLoc,
      arrivalFlightNo,
      transferOutDateTime,
      transferOutHotelLoc,
      transferOutAirportLoc,
      departureFlightNo,
      tourStartDate,
      tourEndDate,
      tourDays,
      meetGreet,
      signText,
      passengerName,
      passengerPhone,
      passengers,
      comment,
      clientPriceStr,
      commissionStr,
      commissionMode,
      paymentWhen,
    ],
  );

  function validateStep2(): string | null {
    return validateSmartBookingStep2(serviceFlags, legState, t);
  }

  function resetWizard() {
    setStep(1);
    setStep1Error(null);
    setServiceFlags(emptyServiceFlags());
    setArrivalFlightNo('');
    setDepartureFlightNo('');
    setTransferInDateTime(null);
    setTransferOutDateTime(null);
    setPassengers('2');
    setVehicleClass('comfort');
    setSelectedVehicleType(VEHICLE_TYPES[0]);
    setDriverTargetMode('all');
    selectDriver(null, null);
    setRequiredLanguages([]);
    setMeetGreet(false);
    setSignText('');
    setPickupSignLogo(null);
    setPassengerName('');
    setPassengerPhone('');
    setClientPriceStr('');
    setCommissionStr('');
    setCommissionMode('gel');
    setComment('');
    setTourStartDate(null);
    setTourEndDate(null);
    setTourDays([]);
    setTransferInAirportLoc({ type: 'airport', name: '' });
    setTransferInHotelLoc(emptyLocationValue());
    setTransferOutAirportLoc({ type: 'airport', name: '' });
    setTransferOutHotelLoc(emptyLocationValue());
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
    if (offeredGelParsed <= 0) {
      return t('newBooking.validation.offeredPrice');
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

    setSubmitting(true);
    setSubmitError(null);
    const offeredGel = offeredGelParsed;
    const insertPayload = composeInsertBookingInput({
      flags: serviceFlags,
      state: legState,
      t,
      companyId: user.id,
      companyName: companyDisplayName(profile, user) ?? t('common.companyDefault'),
      operatorName,
      vehicleType: selectedVehicleType,
      vehicleClass,
      offeredGel,
      driverId: driverTargetMode === 'specific' && selectedDriverId ? selectedDriverId : null,
      vehicleId:
        driverTargetMode === 'specific' && selectedDriverId ? selectedDriverVehicleId : null,
      requiredLanguages,
      requestedDriverCategory: driverCategory,
    });

    const { id: bookingId, error } = await insertBooking(insertPayload);
    if (error) {
      setSubmitting(false);
      const message = mapSupabaseError(error);
      setSubmitError(message);
      showErrorAlert(message);
      return;
    }

    if (bookingId && pickupSignLogo) {
      const { url, error: uploadErr } = await uploadPickupSignLogo(bookingId, pickupSignLogo);
      if (uploadErr || !url) {
        const uploadMsg = mapPickupSignLogoError(uploadErr, t);
        showErrorAlert(uploadMsg);
      } else {
        const { error: logoDbErr } = await setBookingPickupSignLogoUrl(bookingId, url);
        if (logoDbErr) {
          showErrorAlert(mapSupabaseError(logoDbErr));
        }
      }
    }

    setSubmitting(false);
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
                ? t('newBooking.smartForm.step1Title')
                : step === 2
                  ? t('newBooking.stepDetails')
                  : t('newBooking.stepSummary'),
          })}
        </Text>

        {step === 1 ? (
          <View style={styles.block}>
            <ServiceCheckboxStep
              flags={serviceFlags}
              onChange={(next) => {
                setServiceFlags(next);
                setStep1Error(null);
              }}
              step1Error={step1Error}
            />
          </View>
        ) : null}

        {step >= 2 ? (
          <OperatorPicker
            members={operators}
            loading={operatorsLoading}
            selectedName={selectedOperatorName}
            onSelect={setSelectedOperatorName}
          />
        ) : null}

        {step === 2 ? (
          <View style={styles.block}>
            {serviceFlags.wantArrivalTransfer ? (
              <ArrivalTransferSection
                transferInDateTime={transferInDateTime}
                onTransferInDateTimeChange={setTransferInDateTime}
                transferInAirportLoc={transferInAirportLoc}
                onTransferInAirportLocChange={setTransferInAirportLoc}
                transferInHotelLoc={transferInHotelLoc}
                onTransferInHotelLocChange={setTransferInHotelLoc}
                arrivalFlightNo={arrivalFlightNo}
                onArrivalFlightNoChange={setArrivalFlightNo}
                styles={styles}
              />
            ) : null}

            {serviceFlags.wantTour ? (
              <TourItinerarySection
                tourStartDate={tourStartDate}
                onTourStartDateChange={setTourStartDate}
                tourEndDate={tourEndDate}
                onTourEndDateChange={setTourEndDate}
                tourDays={tourDays}
                onPatchTourDay={patchTourDay}
                styles={styles}
              />
            ) : null}

            {serviceFlags.wantDepartureTransfer ? (
              <DepartureTransferSection
                transferOutDateTime={transferOutDateTime}
                onTransferOutDateTimeChange={setTransferOutDateTime}
                transferOutHotelLoc={transferOutHotelLoc}
                onTransferOutHotelLocChange={setTransferOutHotelLoc}
                transferOutAirportLoc={transferOutAirportLoc}
                onTransferOutAirportLocChange={setTransferOutAirportLoc}
                departureFlightNo={departureFlightNo}
                onDepartureFlightNoChange={setDepartureFlightNo}
                styles={styles}
              />
            ) : null}

            {isPureTransfer(serviceFlags) ? (
              <TransferExtrasSection
                meetGreet={meetGreet}
                onMeetGreetChange={setMeetGreet}
                signText={signText}
                onSignTextChange={setSignText}
                passengerName={passengerName}
                onPassengerNameChange={setPassengerName}
                passengerPhone={passengerPhone}
                onPassengerPhoneChange={setPassengerPhone}
                pickupSignLogo={pickupSignLogo}
                onPickupSignLogoChange={setPickupSignLogo}
                commissionStr={commissionStr}
                onCommissionStrChange={setCommissionStr}
                commissionMode={commissionMode}
                onCommissionModeChange={setCommissionMode}
                showCommission
                submitting={submitting}
                styles={styles}
              />
            ) : null}

            <PassengerStepper value={passengers} onChange={setPassengers} />
            <VehiclePicker
              selectedVehicleType={selectedVehicleType}
              onVehicleTypeChange={setSelectedVehicleType}
              vehicleClass={vehicleClass}
              onVehicleClassChange={setVehicleClass}
            />
            <LanguageMultiSelect
              label={t('newBooking.form.requiredLanguages')}
              hint={t('newBooking.form.requiredLanguagesHint')}
              value={requiredLanguages}
              onChange={setRequiredLanguages}
            />

            {!isPureTransfer(serviceFlags) ? (
              <PickupSignLogoField
                value={pickupSignLogo}
                onChange={setPickupSignLogo}
                disabled={submitting}
              />
            ) : null}

            <Text style={styles.sectionHeader}>{t('newBooking.form.note')}</Text>
            <AuthInput
              label={t('newBooking.form.comment')}
              value={comment}
              onChangeText={setComment}
              multiline
              style={styles.textArea}
            />
          </View>
        ) : null}

        {step === 3 && (
          <View style={styles.block}>
            <BookingSummaryStep
              flags={serviceFlags}
              companyName={companyName}
              operatorName={selectedOperatorName}
              previewVoucherId={previewVoucherId}
              selectedVehicleType={selectedVehicleType}
              vehicleClass={vehicleClass}
              transferInDateTime={transferInDateTime}
              transferInAirportLoc={transferInAirportLoc}
              transferInHotelLoc={transferInHotelLoc}
              arrivalFlightNo={arrivalFlightNo}
              transferOutDateTime={transferOutDateTime}
              transferOutHotelLoc={transferOutHotelLoc}
              transferOutAirportLoc={transferOutAirportLoc}
              departureFlightNo={departureFlightNo}
              tourStartDate={tourStartDate}
              tourEndDate={tourEndDate}
              tourDays={tourDays}
              passengerName={passengerName}
              meetGreet={meetGreet}
              signText={signText}
              pickupSignLogo={pickupSignLogo}
              pax={pax}
              paymentWhen={paymentWhen}
              paymentLabel={paymentLabel}
              clientPriceStr={clientPriceStr}
              onClientPriceStrChange={setClientPriceStr}
              driverOfferGel={driverOfferGel}
              offeredGelParsed={offeredGelParsed}
              formatGel={formatGel}
              paymentOptions={PAYMENT_OPTIONS}
              onPaymentWhenChange={setPaymentWhen}
              styles={styles}
            />

            <DriverCategorySelect value={driverCategory} onChange={setDriverCategory} />

            <MatchingDriversSection
              active
              vehicleType={selectedVehicleType}
              vehicleClass={vehicleClass}
              requiredLanguages={requiredLanguages}
              driverCategory={driverCategory}
              driverTargetMode={driverTargetMode}
              onDriverTargetModeChange={setDriverTargetMode}
              selectedDriverId={selectedDriverId}
              selectedDriverVehicleId={selectedDriverVehicleId}
              onSelectDriver={selectDriver}
              onDriversLoaded={setMatchingDrivers}
              minPassengerCapacity={pax}
              filterByMinSeats={filterByMinSeats}
              onFilterByMinSeatsChange={setFilterByMinSeats}
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
                if (step === 1) {
                  const step1Err = validateSmartBookingStep1(serviceFlags, t);
                  if (step1Err) {
                    setStep1Error(step1Err);
                    showValidationAlert(step1Err);
                    return;
                  }
                  setStep1Error(null);
                }
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
  orDivider: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    marginVertical: SPACING.sm,
    fontWeight: '600',
  },
  voucherLogoPreview: {
    marginTop: SPACING.sm,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  voucherLogoImage: {
    width: '100%',
    maxWidth: 400,
    height: 120,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surfaceAlt,
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
  fieldHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: -6,
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
    marginBottom: SPACING.sm,
  },
  tourOvernightSummary: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.md,
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
  minSeatsFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  minSeatsFilterRowActive: {
    borderColor: '#EF9F27',
    backgroundColor: COLORS.goldTint,
  },
  minSeatsFilterLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
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
  driverCardPhotos: {
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  driverVehicleThumb: {
    width: 52,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
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
  // ─── Dropdown styles ───────────────────────────────────────────────────────
  ddWrapper: {
    marginBottom: SPACING.md,
  },
  ddTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  ddTriggerText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  ddPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  ddList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    ...SHADOWS.cardStrong,
    zIndex: 999,
  },
  ddItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ddItemActive: {
    backgroundColor: COLORS.goldTint,
  },
  ddItemText: {
    fontSize: 15,
    color: COLORS.text,
  },
  ddItemTextActive: {
    color: COLORS.goldDark,
    fontWeight: '700',
  },
  // ─── Stepper styles ────────────────────────────────────────────────────────
  stepperWrapper: {
    marginBottom: SPACING.md,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
});
