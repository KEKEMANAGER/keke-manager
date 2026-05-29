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
import { UserAvatar } from '../../components/UserAvatar';
import { SearchableCitySelect } from '../../components/SearchableCitySelect';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  insertBooking,
  normalizeBookingKind,
  setBookingPickupSignLogoUrl,
  uploadPickupSignLogo,
  type BookingType as DbBookingType,
  type ItineraryDay,
  type PickupSignLogoFile,
  type TourTransferLeg,
} from '../../lib/bookings';
import { LocationPicker } from '../../components/LocationPicker';
import { PickupSignLogoField } from '../../components/PickupSignLogoField';
import {
  emptyLocationValue,
  formatLocationDisplay,
  formatLocationRoute,
  locationValueIsComplete,
  persistLocationFields,
  type LocationValue,
} from '../../lib/bookingLocations';
import { isPickupSignLogoPdf } from '../../lib/pickupSignLogo';
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
  buildTourRouteText,
  countTourOvernights,
  generateTourDaysFromRange,
  itineraryFromTourDays,
  persistTourDaysForDb,
  tourBookingPrimaryDateIso,
  tourEndpointsFromDays,
  type TourDayForm,
} from '../../lib/tourDays';
import { bookingKindLabel } from '../../lib/bookingLabels';
import { DriverCategorySelect } from '../../components/DriverCategorySelect';
import { fetchMatchingDrivers, type MatchingDriver } from '../../lib/drivers';
import type { RequestedDriverCategory } from '../../lib/driverCategory';
import { formatSpokenLanguagesList } from '../../lib/spokenLanguages';
import { LanguageMultiSelect } from '../../components/LanguageMultiSelect';
import { PricingCalculator, type PricingCalculatorContext } from '../../components/PricingCalculator';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import type { RouteSegment } from '../../lib/osrmRouting';
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
  const [booking_kind, set_booking_kind] = useState<BookingKindUi>('transfer');

  const [transferTab, setTransferTab] = useState<TransferTab>('arrival');
  const [arrivalFrom, setArrivalFrom] = useState<LocationValue>(() => ({
    type: 'airport',
    name: '',
  }));
  const [arrivalTo, setArrivalTo] = useState<LocationValue>(() => emptyLocationValue());
  const [arrivalFlightNo, setArrivalFlightNo] = useState('');
  const [departureFlightNo, setDepartureFlightNo] = useState('');
  const [arrivalDateTime, setArrivalDateTime] = useState<Date | null>(null);
  const [departureFrom, setDepartureFrom] = useState<LocationValue>(() => emptyLocationValue());
  const [departureTo, setDepartureTo] = useState<LocationValue>(() => ({
    type: 'airport',
    name: '',
  }));
  const [departureDateTime, setDepartureDateTime] = useState<Date | null>(null);

  const [bookingDateTime, setBookingDateTime] = useState<Date | null>(null);
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
  const [tourRouteDescription, setTourRouteDescription] = useState('');

  const [days, setDays] = useState<ItineraryDay[]>(() => [initialItineraryDay(1)]);
  const [transferIn, setTransferIn] = useState<TourTransferLeg>(() => emptyTransferLeg());
  const [transferOut, setTransferOut] = useState<TourTransferLeg>(() => emptyTransferLeg());
  const [transferInDateTime, setTransferInDateTime] = useState<Date | null>(null);
  const [transferOutDateTime, setTransferOutDateTime] = useState<Date | null>(null);
  const [hasArrivalTransfer, setHasArrivalTransfer] = useState(false);
  const [hasDepartureTransfer, setHasDepartureTransfer] = useState(false);
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

  useEffect(() => {
    if (booking_kind !== 'tour') return;
    if (!tourStartDate || !tourEndDate) {
      setTourDays([]);
      return;
    }
    setTourDays((prev) => generateTourDaysFromRange(tourStartDate, tourEndDate, prev));
  }, [booking_kind, tourStartDate, tourEndDate]);

  const tourOvernightCount = useMemo(
    () => countTourOvernights(tourDays.length),
    [tourDays.length],
  );

  const pricingCalculatorContext = useMemo((): PricingCalculatorContext => {
    const locationTexts: string[] = [];
    let segments: RouteSegment[] = [];
    let dayCount = 1;

    if (booking_kind === 'transfer') {
      if (transferTab === 'arrival') {
        segments = [{ from: arrivalFrom.name, to: arrivalTo.name }];
        locationTexts.push(arrivalFrom.name, arrivalTo.name);
      } else {
        segments = [{ from: departureFrom.name, to: departureTo.name }];
        locationTexts.push(departureFrom.name, departureTo.name);
      }
    } else if (booking_kind === 'dayTour') {
      const d = days[0];
      if (d) {
        segments = [{ from: d.from, to: d.to }];
        locationTexts.push(d.from, d.to, d.stops);
      }
    } else if (booking_kind === 'tour') {
      segments = tourDays
        .map((d) => ({ from: d.from, to: d.to }))
        .filter((s) => s.from.trim() || s.to.trim());
      for (const d of tourDays) {
        locationTexts.push(d.from, d.to, d.stops, d.touristHotel, d.driverOvernight);
      }
      dayCount = Math.max(1, tourDays.length);
    }

    return {
      segments,
      locationTexts,
      dayCount,
      vehicleType: selectedVehicleType,
    };
  }, [
    booking_kind,
    transferTab,
    arrivalFrom.name,
    arrivalTo.name,
    departureFrom.name,
    departureTo.name,
    days,
    tourDays,
    selectedVehicleType,
  ]);

  const canRunPricingCalculator = useMemo(
    () => pricingCalculatorContext.segments.some((s) => s.from.trim() && s.to.trim()),
    [pricingCalculatorContext.segments],
  );

  const applyCalculatedPrice = useCallback((gel: number) => {
    setClientPriceStr(String(gel));
  }, []);

  const pax = Math.max(1, parseInt(passengers, 10) || 1);
  const estimateGel = useMemo(
    () => calcMockPrice({ type: booking_kind, passengers: pax, vehicleClass }),
    [booking_kind, pax, vehicleClass],
  );

  const offeredGelParsed = useMemo(
    () => parseAmountGeorgian(clientPriceStr),
    [clientPriceStr],
  );
  const driverOfferGel = offeredGelParsed > 0 ? offeredGelParsed : estimateGel;
  const commissionGelPreview = useMemo(
    () =>
      booking_kind === 'transfer' && offeredGelParsed > 0
        ? commissionGelAmount(offeredGelParsed, commissionStr, commissionMode)
        : 0,
    [booking_kind, offeredGelParsed, commissionStr, commissionMode],
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

  function patchTourDay(index: number, patch: Partial<TourDayForm>) {
    setTourDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
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
        if (!locationValueIsComplete(arrivalFrom)) return t('newBooking.validation.locationFrom');
        if (!locationValueIsComplete(arrivalTo)) return t('newBooking.validation.locationTo');
        if (!arrivalDateTime) return t('newBooking.validation.dateTime');
        return null;
      }
      if (!locationValueIsComplete(departureFrom)) return t('newBooking.validation.locationFrom');
      if (!locationValueIsComplete(departureTo)) return t('newBooking.validation.locationTo');
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
      if (!tourStartDate || !tourEndDate) {
        return t('newBooking.validation.tourDates');
      }
      if (tourEndDate.getTime() < tourStartDate.getTime()) {
        return t('newBooking.validation.tourEndBeforeStart');
      }
      if (!tourDays.length || !tourDays.some((d) => d.from.trim())) {
        return t('newBooking.validation.tourDays');
      }
      if (hasArrivalTransfer) {
        if (!transferInDateTime) return t('newBooking.validation.dateTime');
        if (!locationValueIsComplete(transferInAirportLoc)) return t('newBooking.validation.locationFrom');
        if (!locationValueIsComplete(transferInHotelLoc)) return t('newBooking.validation.locationTo');
      }
      if (hasDepartureTransfer) {
        if (!transferOutDateTime) return t('newBooking.validation.departureDate');
        if (!locationValueIsComplete(transferOutHotelLoc)) return t('newBooking.validation.locationFrom');
        if (!locationValueIsComplete(transferOutAirportLoc)) return t('newBooking.validation.locationTo');
      }
      return null;
    }
    return t('newBooking.validation.kind');
  }

  function resetWizard() {
    setStep(1);
    set_booking_kind('transfer');
    setTransferTab('arrival');
    setArrivalFrom({ type: 'airport', name: '' });
    setArrivalTo(emptyLocationValue());
    setArrivalFlightNo('');
    setArrivalDateTime(null);
    setDepartureFrom(emptyLocationValue());
    setDepartureTo({ type: 'airport', name: '' });
    setDepartureDateTime(null);
    setBookingDateTime(null);
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
    setTourRouteDescription('');
    setDays([initialItineraryDay(1)]);
    setTransferIn(emptyTransferLeg());
    setTransferOut(emptyTransferLeg());
    setTransferInDateTime(null);
    setTransferOutDateTime(null);
    setHasArrivalTransfer(false);
    setHasDepartureTransfer(false);
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

    const dbKind = normalizeBookingKind(mapBookingType(booking_kind));

    setSubmitting(true);
    setSubmitError(null);
    const offeredGel = offeredGelParsed;
    const commissionGelDb =
      booking_kind === 'transfer' && commissionStr.trim()
        ? commissionGelAmount(offeredGel, commissionStr, commissionMode)
        : null;
    const isMultiDayTour = booking_kind === 'tour';
    const isDayTour = booking_kind === 'dayTour';
    const isTour = isMultiDayTour || isDayTour;
    const tourDaysDb = isMultiDayTour ? persistTourDaysForDb(tourDays) : null;
    const itineraryDb = isMultiDayTour
      ? itineraryFromTourDays(tourDaysDb ?? [])
      : isDayTour
        ? persistItineraryForDb(days)
        : null;
    const tourEnds = isMultiDayTour
      ? tourEndpointsFromDays(tourDaysDb ?? [])
      : isDayTour
        ? tourEndpoints(itineraryDb ?? [])
        : { from: null, to: null };
    const transferInAirportP = persistLocationFields(transferInAirportLoc);
    const transferInHotelP = persistLocationFields(transferInHotelLoc);
    const transferOutHotelP = persistLocationFields(transferOutHotelLoc);
    const transferOutAirportP = persistLocationFields(transferOutAirportLoc);
    const arrivalFromP = persistLocationFields(arrivalFrom);
    const arrivalToP = persistLocationFields(arrivalTo);
    const departureFromP = persistLocationFields(departureFrom);
    const departureToP = persistLocationFields(departureTo);

    const transferInDb: TourTransferLeg | null =
      isMultiDayTour && hasArrivalTransfer && transferInDateTime
        ? {
            date: toIsoString(transferInDateTime),
            airport: transferInAirportP.name ?? undefined,
            airport_type: transferInAirportP.type,
            hotel: transferInHotelP.name ?? undefined,
            hotel_type: transferInHotelP.type,
          }
        : null;
    const transferOutDb: TourTransferLeg | null =
      isMultiDayTour && hasDepartureTransfer && transferOutDateTime
        ? {
            date: toIsoString(transferOutDateTime),
            hotel: transferOutHotelP.name ?? undefined,
            hotel_type: transferOutHotelP.type,
            airport: transferOutAirportP.name ?? undefined,
            airport_type: transferOutAirportP.type,
          }
        : null;
    const structuredRoute = isMultiDayTour
      ? buildTourRouteText(tourDaysDb ?? [], (day, from, to) =>
          t('newBooking.dayLine', { day, from, to }),
        )
      : isDayTour
        ? buildTourRouteDescription(days, (day, from, to) =>
            t('newBooking.dayLine', { day, from, to }),
          )
        : null;
    const descPart = isDayTour ? tourRouteDescription.trim() : '';
    const routeForDb =
      isTour ? [descPart, structuredRoute].filter(Boolean).join('\n\n') || null : null;

    const { id: bookingId, error } = await insertBooking({
      company_id: user.id,
      company_name: companyDisplayName(profile, user) ?? t('common.companyDefault'),
      kind: dbKind,
      from_location:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalFromP.name
            : departureFromP.name
          : tourEnds.from,
      from_location_type:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalFromP.type
            : departureFromP.type
          : null,
      to_location:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalToP.name
            : departureToP.name
          : tourEnds.to,
      to_location_type:
        booking_kind === 'transfer'
          ? transferTab === 'arrival'
            ? arrivalToP.type
            : departureToP.type
          : null,
      route: routeForDb,
      date_display: isDayTour
        ? bookingDateTime
          ? toIsoString(bookingDateTime)
          : null
        : isMultiDayTour
          ? tourBookingPrimaryDateIso(
              tourStartDate,
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
        booking_kind === 'transfer'
          ? (transferTab === 'arrival' ? arrivalFlightNo : departureFlightNo).trim() || null
          : null,
      meet_greet: booking_kind === 'transfer' ? meetGreet : false,
      sign_text:
        booking_kind === 'transfer' && meetGreet && signText.trim() ? signText.trim() : null,
      passenger_name: booking_kind === 'transfer' ? passengerName.trim() || null : null,
      passenger_phone: booking_kind === 'transfer' ? passengerPhone.trim() || null : null,
      flight_direction: booking_kind === 'transfer' ? transferTab : null,
      pickup_time: null,
      client_price: offeredGel,
      commission:
        booking_kind === 'transfer' && commissionGelDb !== null && commissionGelDb > 0
          ? commissionGelDb
          : null,
      tour_days: tourDaysDb,
      itinerary: itineraryDb,
      transfer_in: transferInDb,
      transfer_out: transferOutDb,
      comment: comment.trim() || null,
      payment_method: paymentWhen,
      price_gel: offeredGel,
      created_by_name: operatorName,
      driver_id:
        driverTargetMode === 'specific' && selectedDriverId ? selectedDriverId : null,
      vehicle_id:
        driverTargetMode === 'specific' && selectedDriverId ? selectedDriverVehicleId : null,
      required_languages: requiredLanguages.length > 0 ? requiredLanguages : null,
      requested_driver_category: driverCategory,
    });
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
                  <LocationPicker
                    label={t('newBooking.form.pickupLocation')}
                    value={arrivalFrom}
                    onChange={setArrivalFrom}
                  />
                  <AuthInput
                    label={t('newBooking.flightNumber')}
                    value={arrivalFlightNo}
                    onChangeText={setArrivalFlightNo}
                    autoCapitalize="characters"
                    placeholder={t('newBooking.flightNumberPlaceholder')}
                  />
                  <DateTimeField
                    label={t('newBooking.form.dateTime')}
                    value={arrivalDateTime}
                    onChange={setArrivalDateTime}
                    placeholder={t('newBooking.form.placeholders.dateTime')}
                    minimumDate={new Date()}
                  />
                  <LocationPicker
                    label={t('newBooking.form.dropoffLocation')}
                    value={arrivalTo}
                    onChange={setArrivalTo}
                  />
                </>
              ) : (
                <>
                  <LocationPicker
                    label={t('newBooking.form.pickupLocation')}
                    value={departureFrom}
                    onChange={setDepartureFrom}
                  />
                  <DateTimeField
                    label={t('newBooking.form.departureDateTime')}
                    value={departureDateTime}
                    onChange={setDepartureDateTime}
                    placeholder={t('newBooking.form.placeholders.dateTime')}
                    minimumDate={new Date()}
                  />
                  <LocationPicker
                    label={t('newBooking.form.dropoffLocation')}
                    value={departureTo}
                    onChange={setDepartureTo}
                  />
                  <AuthInput
                    label={t('newBooking.flightNumber')}
                    value={departureFlightNo}
                    onChangeText={setDepartureFlightNo}
                    autoCapitalize="characters"
                    placeholder={t('newBooking.flightNumberPlaceholder')}
                  />
                </>
              )}
            </View>

            <View style={styles.compactDivider} />

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
            {meetGreet ? (
              <Text style={styles.orDivider}>{t('newBooking.pickupSignLogo.orAnd')}</Text>
            ) : null}
            <PickupSignLogoField
              value={pickupSignLogo}
              onChange={setPickupSignLogo}
              disabled={submitting}
            />

            <Text style={styles.sectionHeader}>{t('newBooking.form.prices')}</Text>
            <AuthInput
              label={t('newBooking.form.clientPrice')}
              value={clientPriceStr}
              onChangeText={setClientPriceStr}
              keyboardType="decimal-pad"
              placeholder={t('newBooking.form.placeholders.zero')}
            />
            <PricingCalculator
              context={pricingCalculatorContext}
              canCalculate={canRunPricingCalculator}
              onApplyPrice={applyCalculatedPrice}
              disabled={submitting}
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
            <Text style={styles.driverPayNote}>
              {t('newBooking.form.driverOfferNote', { amount: formatGel(driverOfferGel) })}
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
            <PassengerStepper value={passengers} onChange={setPassengers} />
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
            <LanguageMultiSelect
              label={t('newBooking.form.requiredLanguages')}
              hint={t('newBooking.form.requiredLanguagesHint')}
              value={requiredLanguages}
              onChange={setRequiredLanguages}
            />

            <PickupSignLogoField
              value={pickupSignLogo}
              onChange={setPickupSignLogo}
              disabled={submitting}
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
                <LocationPicker
                  label={t('newBooking.form.transferInFrom')}
                  value={transferInAirportLoc}
                  onChange={setTransferInAirportLoc}
                />
                <LocationPicker
                  label={t('newBooking.form.transferInTo')}
                  value={transferInHotelLoc}
                  onChange={setTransferInHotelLoc}
                />
              </>
            ) : null}

            <Text style={styles.sectionHeader}>{t('newBooking.form.tourCalendar')}</Text>
            <DateTimeField
              label={t('newBooking.form.tourStartDate')}
              value={tourStartDate}
              onChange={setTourStartDate}
              placeholder={t('newBooking.form.placeholders.dateTime')}
              minimumDate={new Date()}
            />
            <DateTimeField
              label={t('newBooking.form.tourEndDate')}
              value={tourEndDate}
              onChange={setTourEndDate}
              placeholder={t('newBooking.form.placeholders.dateTime')}
              minimumDate={tourStartDate ?? new Date()}
            />
            {tourDays.length > 0 ? (
              <Text style={styles.tourOvernightSummary}>
                {t('newBooking.form.totalOvernights', { count: tourOvernightCount })}
              </Text>
            ) : null}
            {tourDays.map((day, dayIndex) => {
              const isLastDay = dayIndex === tourDays.length - 1;
              return (
                <View key={`tour-day-${day.date}-${dayIndex}`} style={styles.tourDayBlock}>
                  <Text style={styles.tourDayTitle}>
                    {t('newBooking.form.dayN', { n: day.day })}
                  </Text>
                  <AuthInput
                    label={t('newBooking.form.from')}
                    value={day.from}
                    onChangeText={(text) => patchTourDay(dayIndex, { from: text })}
                  />
                  <AuthInput
                    label={t('newBooking.form.to')}
                    value={day.to}
                    onChangeText={(text) => patchTourDay(dayIndex, { to: text })}
                  />
                  <AuthInput
                    label={t('newBooking.form.stops')}
                    value={day.stops}
                    onChangeText={(text) => patchTourDay(dayIndex, { stops: text })}
                    placeholder={t('newBooking.form.placeholders.stopsExample')}
                    multiline
                    style={styles.textArea}
                  />
                  {!isLastDay ? (
                    <>
                      <AuthInput
                        label={t('newBooking.form.touristHotel')}
                        value={day.touristHotel}
                        onChangeText={(text) => patchTourDay(dayIndex, { touristHotel: text })}
                        placeholder={t('newBooking.form.placeholders.touristHotel')}
                      />
                      <Text style={styles.fieldHint}>{t('newBooking.form.touristHotelHint')}</Text>
                      <AuthInput
                        label={t('newBooking.form.driverOvernight')}
                        value={day.driverOvernight}
                        onChangeText={(text) => patchTourDay(dayIndex, { driverOvernight: text })}
                        placeholder={t('newBooking.form.placeholders.driverOvernight')}
                      />
                      <Text style={styles.fieldHint}>{t('newBooking.form.driverOvernightHint')}</Text>
                    </>
                  ) : null}
                </View>
              );
            })}

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
                <LocationPicker
                  label={t('newBooking.form.transferOutFrom')}
                  value={transferOutHotelLoc}
                  onChange={setTransferOutHotelLoc}
                />
                <LocationPicker
                  label={t('newBooking.form.transferOutTo')}
                  value={transferOutAirportLoc}
                  onChange={setTransferOutAirportLoc}
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
            <LanguageMultiSelect
              label={t('newBooking.form.requiredLanguages')}
              hint={t('newBooking.form.requiredLanguagesHint')}
              value={requiredLanguages}
              onChange={setRequiredLanguages}
            />

            <PickupSignLogoField
              value={pickupSignLogo}
              onChange={setPickupSignLogo}
              disabled={submitting}
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
            {(booking_kind === 'tour' || booking_kind === 'dayTour') ? (
              <>
                <Text style={styles.sectionHeader}>{t('newBooking.form.prices')}</Text>
                <AuthInput
                  label={t('newBooking.form.offeredPrice')}
                  value={clientPriceStr}
                  onChangeText={setClientPriceStr}
                  keyboardType="decimal-pad"
                  placeholder={t('newBooking.form.placeholders.zero')}
                />
                <PricingCalculator
                  context={pricingCalculatorContext}
                  canCalculate={canRunPricingCalculator}
                  onApplyPrice={applyCalculatedPrice}
                  disabled={submitting}
                />
              </>
            ) : null}
            {booking_kind === 'transfer' ? (
              <PricingCalculator
                context={pricingCalculatorContext}
                canCalculate={canRunPricingCalculator}
                onApplyPrice={applyCalculatedPrice}
                disabled={submitting}
              />
            ) : null}
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>{t('newBooking.form.offeredPriceDriver')}</Text>
              <Text style={styles.priceBig}>{formatGel(driverOfferGel)}</Text>
              {offeredGelParsed <= 0 ? (
                <Text style={styles.priceNote}>{t('newBooking.form.offeredPriceRequiredHint')}</Text>
              ) : (
                <Text style={styles.priceNote}>{t('newBooking.form.offeredPriceSameNote')}</Text>
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
              {booking_kind === 'dayTour' && tourRouteDescription.trim() ? (
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
                      ? formatLocationRoute(
                          arrivalFrom.name,
                          arrivalFrom.type,
                          arrivalTo.name,
                          arrivalTo.type,
                        )
                      : formatLocationRoute(
                          departureFrom.name,
                          departureFrom.type,
                          departureTo.name,
                          departureTo.type,
                        )}
                  </Text>
                  {transferTab === 'arrival' && arrivalDateTime ? (
                    <Text style={styles.vLine}>{formatDisplayDateTime(arrivalDateTime)}</Text>
                  ) : null}
                  {transferTab === 'departure' && departureDateTime ? (
                    <Text style={styles.vLine}>{formatDisplayDateTime(departureDateTime)}</Text>
                  ) : null}
                  {(transferTab === 'arrival' ? arrivalFlightNo : departureFlightNo).trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('companyVoucher.flightNumber')}:{' '}
                      {(transferTab === 'arrival' ? arrivalFlightNo : departureFlightNo).trim()}
                    </Text>
                  ) : null}
                  {passengerName.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherPassenger')}: {passengerName.trim()}
                    </Text>
                  ) : null}
                  {meetGreet && signText.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {t('bookings.voucherPickupSignName')}: {signText.trim()}
                    </Text>
                  ) : null}
                  {pickupSignLogo ? (
                    <View style={styles.voucherLogoPreview}>
                      <Text style={styles.vLineMuted}>{t('bookings.voucherPickupSignMark')}</Text>
                      {isPickupSignLogoPdf(pickupSignLogo) ? (
                        <Text style={styles.vLineMuted}>
                          {t('newBooking.pickupSignLogo.pdfReady')}
                        </Text>
                      ) : (
                        <Image
                          source={{ uri: pickupSignLogo.uri }}
                          style={styles.voucherLogoImage}
                          resizeMode="contain"
                        />
                      )}
                    </View>
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
                  {hasArrivalTransfer ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherTransferInRoute', {
                        datetime: transferInDateTime
                          ? formatDisplayDateTime(transferInDateTime)
                          : '—',
                        from: formatLocationDisplay(
                          transferInAirportLoc.name,
                          transferInAirportLoc.type,
                        ),
                        to: formatLocationDisplay(transferInHotelLoc.name, transferInHotelLoc.type),
                      })}
                    </Text>
                  ) : null}
                  {tourStartDate && tourEndDate ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherTourRange', {
                        from: formatDisplayDateTime(tourStartDate),
                        to: formatDisplayDateTime(tourEndDate),
                      })}
                    </Text>
                  ) : null}
                  {tourDays.map((d, idx) => {
                    const isLast = idx === tourDays.length - 1;
                    return (
                      <Text key={`preview-tour-day-${d.day}`} style={styles.vLineMuted}>
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
                        {!isLast && d.touristHotel.trim()
                          ? ` · ${t('newBooking.form.touristHotel')}: ${d.touristHotel.trim()}`
                          : ''}
                        {!isLast && d.driverOvernight.trim()
                          ? ` · ${t('newBooking.form.driverOvernight')}: ${d.driverOvernight.trim()}`
                          : ''}
                      </Text>
                    );
                  })}
                  {tourOvernightCount > 0 ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.totalOvernights', { count: tourOvernightCount })}
                    </Text>
                  ) : null}
                  {hasDepartureTransfer ? (
                    <Text style={styles.vLineMuted}>
                      {t('newBooking.form.voucherTransferOutRoute', {
                        datetime: transferOutDateTime
                          ? formatDisplayDateTime(transferOutDateTime)
                          : '—',
                        from: formatLocationDisplay(
                          transferOutHotelLoc.name,
                          transferOutHotelLoc.type,
                        ),
                        to: formatLocationDisplay(
                          transferOutAirportLoc.name,
                          transferOutAirportLoc.type,
                        ),
                      })}
                    </Text>
                  ) : null}
                </>
              )}
              {pickupSignLogo && booking_kind !== 'transfer' ? (
                <View style={styles.voucherLogoPreview}>
                  <Text style={styles.vLineMuted}>{t('bookings.voucherPickupSignMark')}</Text>
                  {isPickupSignLogoPdf(pickupSignLogo) ? (
                    <Text style={styles.vLineMuted}>{t('newBooking.pickupSignLogo.pdfReady')}</Text>
                  ) : (
                    <Image
                      source={{ uri: pickupSignLogo.uri }}
                      style={styles.voucherLogoImage}
                      resizeMode="contain"
                    />
                  )}
                </View>
              ) : null}
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherPassengers')}: {pax}
              </Text>
              <Text style={styles.vLine}>
                {t('newBooking.form.voucherPayment')}: {paymentLabel(paymentWhen)}
              </Text>
              <Text style={styles.vPrice}>
                {t('newBooking.form.voucherOfferedPrice')}: {formatGel(driverOfferGel)}
              </Text>
            </View>

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
