import { useUser } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { AuthInput } from '../../components/AuthInput';
import { COLORS, SHADOWS, SPACING } from '../../constants/theme';
import {
  insertBooking,
  type BookingType as DbBookingType,
  type FlightDirection,
  type TourDayPersisted,
  type TourTransferLeg,
} from '../../lib/bookings';

type BookingType = 'transfer' | 'tour' | 'dayTour';
type VehicleClass = 'ეკონომი' | 'კომფორტი' | 'ბიზნეს';
type PaymentWhen = 'ახლა' | 'შემდეგ' | 'კლიენტის ბარათით';
type CommissionMode = 'gel' | 'percent';

const TYPE_LABELS: Record<BookingType, string> = {
  transfer: 'ტრანსფერი',
  tour: 'ტური',
  dayTour: 'ერთდღიანი ტური',
};

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

function mapBookingType(t: BookingType): DbBookingType {
  if (t === 'transfer') return 'transfer';
  if (t === 'tour') return 'tour';
  return 'day_tour';
}

function companyDisplayName(user: ReturnType<typeof useUser>['user']) {
  const raw = user?.unsafeMetadata;
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cn = m.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  return user?.firstName || null;
}

function calcMockPrice(params: {
  type: BookingType;
  passengers: number;
  vehicleClass: VehicleClass;
}): number {
  let base = params.type === 'transfer' ? 120 : params.type === 'tour' ? 450 : 280;
  base += Math.max(0, params.passengers - 1) * 25;
  const mult =
    params.vehicleClass === 'ბიზნეს' ? 1.45 : params.vehicleClass === 'კომფორტი' ? 1.2 : 1;
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

function initialTourDay(): TourDayPersisted {
  return { id: '1', date: '', fromPlace: '', toPlace: '', stops: [], overnight: false };
}

function emptyTransferLeg(): TourTransferLeg {
  return { date: '', flight: '', passengerName: '' };
}

function newTourDayId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function persistTourDaysForDb(days: TourDayPersisted[]): TourDayPersisted[] {
  return days.map((d) => ({
    ...d,
    stops: d.stops.map((s) => s.trim()).filter((s) => s.length > 0),
  }));
}

function buildTourRouteDescription(days: TourDayPersisted[]): string | null {
  const parts = days
    .map((d, idx) => {
      const f = d.fromPlace.trim();
      const t = d.toPlace.trim();
      if (!f && !t) return null;
      return `დღე ${idx + 1}: ${f || '—'} → ${t || '—'}`;
    })
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(' | ') : null;
}

function tourBookingDateDisplay(
  days: TourDayPersisted[],
  tin: TourTransferLeg,
  tout: TourTransferLeg,
): string {
  const dayDate = days.find((d) => d.date.trim())?.date.trim();
  if (dayDate) return dayDate;
  if (tin.date.trim()) return tin.date.trim();
  if (tout.date.trim()) return tout.date.trim();
  return days[0]?.date?.trim() ?? '';
}

function transferLegOrNull(leg: TourTransferLeg): TourTransferLeg | null {
  if (!leg.date.trim() && !leg.flight.trim() && !leg.passengerName.trim()) return null;
  return {
    date: leg.date.trim(),
    flight: leg.flight.trim(),
    passengerName: leg.passengerName.trim(),
  };
}

export default function NewBookingScreen() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preset } = useLocalSearchParams<{ preset?: string }>();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>('transfer');

  const [fromPlace, setFromPlace] = useState('');
  const [toPlace, setToPlace] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [passengers, setPassengers] = useState('2');
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('კომფორტი');
  const [flightNo, setFlightNo] = useState('');
  const [meetGreet, setMeetGreet] = useState(false);
  const [signText, setSignText] = useState('');
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [flightDirection, setFlightDirection] = useState<FlightDirection>('arrival');
  const [pickupTime, setPickupTime] = useState('');
  const [clientPriceStr, setClientPriceStr] = useState('');
  const [commissionStr, setCommissionStr] = useState('');
  const [commissionMode, setCommissionMode] = useState<CommissionMode>('gel');
  const [comment, setComment] = useState('');

  const [tourDays, setTourDays] = useState<TourDayPersisted[]>(() => [initialTourDay()]);
  const [transferIn, setTransferIn] = useState<TourTransferLeg>(() => emptyTransferLeg());
  const [transferOut, setTransferOut] = useState<TourTransferLeg>(() => emptyTransferLeg());

  const [paymentWhen, setPaymentWhen] = useState<PaymentWhen>('ახლა');

  useEffect(() => {
    if (preset === 'transfer' || preset === 'tour' || preset === 'dayTour') {
      setBookingType(preset);
      setStep(2);
    }
  }, [preset]);

  const pax = Math.max(1, parseInt(passengers, 10) || 1);
  const price = useMemo(
    () => calcMockPrice({ type: bookingType, passengers: pax, vehicleClass }),
    [bookingType, pax, vehicleClass],
  );

  const clientGelParsed = useMemo(
    () => (bookingType === 'transfer' ? parseAmountGeorgian(clientPriceStr) : 0),
    [bookingType, clientPriceStr],
  );
  const commissionGelPreview = useMemo(
    () =>
      bookingType === 'transfer'
        ? commissionGelAmount(clientGelParsed, commissionStr, commissionMode)
        : 0,
    [bookingType, clientGelParsed, commissionStr, commissionMode],
  );
  const companyIncomePreview = useMemo(
    () => (bookingType === 'transfer' ? Math.max(0, clientGelParsed - commissionGelPreview) : 0),
    [bookingType, clientGelParsed, commissionGelPreview],
  );

  const previewVoucherId = useMemo(
    () => `KEKE-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    [],
  );

  function patchTourDay(index: number, patch: Partial<TourDayPersisted>) {
    setTourDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function addTourDay() {
    setTourDays((prev) => [
      ...prev,
      {
        id: newTourDayId(),
        date: '',
        fromPlace: '',
        toPlace: '',
        stops: [],
        overnight: false,
      },
    ]);
  }

  function removeTourDay(index: number) {
    setTourDays((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addStop(dayIndex: number) {
    setTourDays((prev) =>
      prev.map((d, i) => (i === dayIndex ? { ...d, stops: [...d.stops, ''] } : d)),
    );
  }

  function patchStop(dayIndex: number, stopIndex: number, text: string) {
    setTourDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        const next = [...d.stops];
        next[stopIndex] = text;
        return { ...d, stops: next };
      }),
    );
  }

  function removeStop(dayIndex: number, stopIndex: number) {
    setTourDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        return { ...d, stops: d.stops.filter((_, si) => si !== stopIndex) };
      }),
    );
  }

  function canAdvanceFrom2(): boolean {
    if (bookingType === 'transfer') {
      return !!(fromPlace.trim() && toPlace.trim() && dateStr.trim());
    }
    if (bookingType === 'tour' || bookingType === 'dayTour') {
      return tourDays.some((d) => d.fromPlace.trim().length > 0);
    }
    return false;
  }

  function resetWizard() {
    setStep(1);
    setBookingType('transfer');
    setFromPlace('');
    setToPlace('');
    setDateStr('');
    setPassengers('2');
    setVehicleClass('კომფორტი');
    setFlightNo('');
    setMeetGreet(false);
    setSignText('');
    setPassengerName('');
    setPassengerPhone('');
    setFlightDirection('arrival');
    setPickupTime('');
    setClientPriceStr('');
    setCommissionStr('');
    setCommissionMode('gel');
    setComment('');
    setTourDays([initialTourDay()]);
    setTransferIn(emptyTransferLeg());
    setTransferOut(emptyTransferLeg());
    setPaymentWhen('ახლა');
    setSubmitError(null);
  }

  async function confirmAndSaveBooking() {
    if (!user?.id) {
      setSubmitError('სესია არ არის ნაპოვნი. გთხოვთ თავიდან შეხვიდეთ.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const clientGel = bookingType === 'transfer' ? parseAmountGeorgian(clientPriceStr) : 0;
    const commissionGelDb =
      bookingType === 'transfer' && commissionStr.trim()
        ? commissionGelAmount(clientGel, commissionStr, commissionMode)
        : null;
    const isTour = bookingType === 'tour' || bookingType === 'dayTour';
    const tourDaysDb = isTour ? persistTourDaysForDb(tourDays) : null;
    const transferInDb: TourTransferLeg | null = isTour ? transferLegOrNull(transferIn) : null;
    const transferOutDb: TourTransferLeg | null = isTour ? transferLegOrNull(transferOut) : null;
    const { error } = await insertBooking({
      company_id: user.id,
      company_name: companyDisplayName(user),
      kind: mapBookingType(bookingType),
      from_location: bookingType === 'transfer' ? fromPlace.trim() : null,
      to_location: bookingType === 'transfer' ? toPlace.trim() : null,
      route: isTour ? buildTourRouteDescription(tourDays) : null,
      date_display: isTour
        ? tourBookingDateDisplay(tourDays, transferIn, transferOut).trim() || null
        : dateStr.trim() || null,
      passengers: pax,
      vehicle_class: vehicleClass,
      flight_number: bookingType === 'transfer' ? flightNo.trim() || null : null,
      meet_greet: bookingType === 'transfer' ? meetGreet : false,
      sign_text:
        bookingType === 'transfer' && meetGreet && signText.trim() ? signText.trim() : null,
      passenger_name: bookingType === 'transfer' ? passengerName.trim() || null : null,
      passenger_phone: bookingType === 'transfer' ? passengerPhone.trim() || null : null,
      flight_direction: bookingType === 'transfer' ? flightDirection : null,
      pickup_time: bookingType === 'transfer' ? pickupTime.trim() || null : null,
      client_price: bookingType === 'transfer' && clientGel > 0 ? clientGel : null,
      commission:
        bookingType === 'transfer' && commissionGelDb !== null && commissionGelDb > 0
          ? commissionGelDb
          : null,
      tour_days: tourDaysDb,
      transfer_in: transferInDb,
      transfer_out: transferOutDb,
      comment: comment.trim() || null,
      payment_method: paymentWhen,
      price_gel: price,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
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
        <Text style={styles.logo}>KEKE.MANAGER</Text>
        <Text style={styles.title}>ახალი ჯავშანი</Text>
        <View style={styles.stepDots}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.dot, step >= s && styles.dotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          ნაბიჯი {step} / 3 —{' '}
          {step === 1 && 'ტიპი'}
          {step === 2 && 'დეტალები'}
          {step === 3 && 'შეჯამება და გადახდა'}
        </Text>

        {step === 1 && (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>აირჩიეთ სერვისის ტიპი</Text>
            {(Object.keys(TYPE_LABELS) as BookingType[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setBookingType(t)}
                style={({ pressed }) => [
                  styles.typeCard,
                  bookingType === t && styles.typeCardActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.typeTitle, bookingType === t && styles.typeTitleActive]}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 2 && bookingType === 'transfer' && (
          <View style={styles.block}>
            <Text style={[styles.sectionHeader, styles.sectionHeaderFirst]}>მარშრუტი</Text>
            <AuthInput label="საიდან" value={fromPlace} onChangeText={setFromPlace} />
            <AuthInput label="სად" value={toPlace} onChangeText={setToPlace} />
            <AuthInput
              label="თარიღი და დრო"
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="მაგ: 20 მაი 2026, 10:00"
            />

            <Text style={styles.sectionHeader}>ავტომობილი</Text>
            <Text style={styles.fieldLabel}>კლასი</Text>
            <View style={styles.chips}>
              {(['ეკონომი', 'კომფორტი', 'ბიზნეს'] as VehicleClass[]).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setVehicleClass(c)}
                  style={[styles.chip, vehicleClass === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, vehicleClass === c && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionHeader}>მგზავრი</Text>
            <Pressable
              onPress={() => setMeetGreet((v) => !v)}
              style={({ pressed }) => [
                styles.meetToggle,
                meetGreet ? styles.meetToggleOn : styles.meetToggleOff,
                pressed && styles.pressed,
              ]}
            >
              <Text style={meetGreet ? styles.meetToggleTextOn : styles.meetToggleTextOff}>
                დასახვედრი პლაკატი
              </Text>
            </Pressable>
            {meetGreet ? (
              <AuthInput
                label="პლაკატზე რა დაიწეროს"
                value={signText}
                onChangeText={setSignText}
                placeholder="სახელი / კომპანია"
              />
            ) : null}
            <AuthInput
              label="მგზავრის სახელი გვარი"
              value={passengerName}
              onChangeText={setPassengerName}
            />
            <AuthInput
              label="მგზავრის ნომერი"
              value={passengerPhone}
              onChangeText={setPassengerPhone}
              keyboardType="phone-pad"
            />
            <AuthInput
              label="მგზავრები"
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
            />

            <Text style={styles.sectionHeader}>ფრენა</Text>
            <AuthInput
              label="ფრენის ნომერი (არასავალდებულო)"
              value={flightNo}
              onChangeText={setFlightNo}
              autoCapitalize="characters"
            />
            <Text style={styles.fieldLabel}>მიმართულება</Text>
            <View style={styles.chips}>
              {(
                [
                  { id: 'arrival' as const, label: 'ჩამოსვლა' },
                  { id: 'departure' as const, label: 'გამგზავრება' },
                ] as const
              ).map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => setFlightDirection(d.id)}
                  style={[styles.chip, flightDirection === d.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, flightDirection === d.id && styles.chipTextActive]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <AuthInput
              label="აყვანის დრო"
              value={pickupTime}
              onChangeText={setPickupTime}
              placeholder="მაგ: 14:30"
            />

            <Text style={styles.sectionHeader}>ფასები</Text>
            <AuthInput
              label="კლიენტის ფასი (₾)"
              value={clientPriceStr}
              onChangeText={setClientPriceStr}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <Text style={styles.fieldLabel}>კომისია (₾ ან %)</Text>
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
              label={commissionMode === 'gel' ? 'კომისია (₾)' : 'კომისია (%)'}
              value={commissionStr}
              onChangeText={setCommissionStr}
              keyboardType="decimal-pad"
              placeholder={commissionMode === 'gel' ? '0' : 'მაგ: 10'}
            />
            {clientGelParsed > 0 ? (
              <View style={styles.incomeRow}>
                <Text style={styles.incomeLabel}>თქვენი შემოსავალი</Text>
                <Text style={styles.incomeValue}>{formatGel(companyIncomePreview)}</Text>
              </View>
            ) : (
              <Text style={styles.incomeHint}>
                შეიყვანეთ კლიენტის ფასი — ნაჩვენები იქნება თქვენი შემოსავალი კომისიის გამოკლებით.
              </Text>
            )}
            <Text style={styles.driverPayNote}>
              მძღოლის ანაზღაურება (სისტემის ფასი): {formatGel(price)}
            </Text>

            <Text style={styles.sectionHeader}>შენიშვნა</Text>
            <AuthInput
              label="კომენტარი"
              value={comment}
              onChangeText={setComment}
              multiline
              style={styles.textArea}
            />
          </View>
        )}

        {step === 2 && bookingType !== 'transfer' && (
          <View style={styles.block}>
            <Text style={[styles.sectionHeader, styles.sectionHeaderFirst]}>ტრანსფერი — ჩამოსვლა</Text>
            <AuthInput
              label="თარიღი და დრო"
              value={transferIn.date}
              onChangeText={(t) => setTransferIn((p) => ({ ...p, date: t }))}
              placeholder="მაგ: 20 მაი 2026, 10:00"
            />
            <AuthInput
              label="ფრენის ნომერი"
              value={transferIn.flight}
              onChangeText={(t) => setTransferIn((p) => ({ ...p, flight: t }))}
              autoCapitalize="characters"
            />
            <AuthInput
              label="მგზავრის სახელი გვარი"
              value={transferIn.passengerName}
              onChangeText={(t) => setTransferIn((p) => ({ ...p, passengerName: t }))}
            />

            <Text style={styles.sectionHeader}>მარშრუტი დღეების მიხედვით</Text>
            {tourDays.map((day, dayIndex) => (
              <View key={day.id} style={styles.tourDayBlock}>
                <View style={styles.tourDayHeaderRow}>
                  <Text style={styles.tourDayTitle}>დღე {dayIndex + 1}</Text>
                  {tourDays.length > 1 ? (
                    <Pressable
                      onPress={() => removeTourDay(dayIndex)}
                      hitSlop={10}
                      style={({ pressed }) => [styles.tourDayRemoveBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.tourDayRemoveText}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
                <AuthInput
                  label="საიდან"
                  value={day.fromPlace}
                  onChangeText={(t) => patchTourDay(dayIndex, { fromPlace: t })}
                />
                <AuthInput
                  label="სად"
                  value={day.toPlace}
                  onChangeText={(t) => patchTourDay(dayIndex, { toPlace: t })}
                />
                <Text style={styles.fieldLabel}>გაჩერებები</Text>
                {day.stops.map((stop, si) => (
                  <View key={`${day.id}-stop-${si}`} style={styles.stopRow}>
                    <View style={styles.stopInputWrap}>
                      <AuthInput
                        label={`გაჩერება ${si + 1}`}
                        value={stop}
                        onChangeText={(t) => patchStop(dayIndex, si, t)}
                      />
                    </View>
                    <Pressable
                      onPress={() => removeStop(dayIndex, si)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.stopRemoveBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.stopRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={() => addStop(dayIndex)}
                  style={({ pressed }) => [styles.addStopBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.addStopBtnText}>გაჩერების დამატება +</Text>
                </Pressable>
                <Pressable
                  onPress={() => patchTourDay(dayIndex, { overnight: !day.overnight })}
                  style={({ pressed }) => [
                    styles.overnightChip,
                    day.overnight && styles.overnightChipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={day.overnight ? styles.overnightChipTextOn : styles.overnightChipTextOff}>
                    ღამისთევა {day.overnight ? '✓' : '✗'}
                  </Text>
                </Pressable>
                <AuthInput
                  label="თარიღი"
                  value={day.date}
                  onChangeText={(t) => patchTourDay(dayIndex, { date: t })}
                  placeholder="მაგ: 21 მაი 2026"
                />
              </View>
            ))}
            <Pressable
              onPress={addTourDay}
              style={({ pressed }) => [styles.addDayOutline, pressed && styles.pressed]}
            >
              <Text style={styles.addDayOutlineText}>დღის დამატება +</Text>
            </Pressable>

            <Text style={styles.sectionHeader}>ტრანსფერი — გამგზავრება</Text>
            <AuthInput
              label="თარიღი და დრო"
              value={transferOut.date}
              onChangeText={(t) => setTransferOut((p) => ({ ...p, date: t }))}
              placeholder="მაგ: 25 მაი 2026, 18:00"
            />
            <AuthInput
              label="ფრენის ნომერი"
              value={transferOut.flight}
              onChangeText={(t) => setTransferOut((p) => ({ ...p, flight: t }))}
              autoCapitalize="characters"
            />
            <AuthInput
              label="მგზავრის სახელი გვარი"
              value={transferOut.passengerName}
              onChangeText={(t) => setTransferOut((p) => ({ ...p, passengerName: t }))}
            />

            <Text style={styles.sectionHeader}>ავტომობილი</Text>
            <AuthInput
              label="მგზავრები"
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>კლასი</Text>
            <View style={styles.chips}>
              {(['ეკონომი', 'კომფორტი', 'ბიზნეს'] as VehicleClass[]).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setVehicleClass(c)}
                  style={[styles.chip, vehicleClass === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, vehicleClass === c && styles.chipTextActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionHeader}>შენიშვნა</Text>
            <AuthInput label="კომენტარი" value={comment} onChangeText={setComment} multiline />
          </View>
        )}

        {step === 3 && (
          <View style={styles.block}>
            <View style={styles.priceBox}>
              {bookingType === 'transfer' ? (
                <>
                  <Text style={styles.priceLabel}>მძღოლის ანაზღაურება (სისტემის ფასი)</Text>
                  <Text style={styles.priceBig}>{formatGel(price)}</Text>
                  {clientGelParsed > 0 ? (
                    <>
                      <View style={styles.priceSplit}>
                        <Text style={styles.priceSubLabel}>კლიენტის ფასი</Text>
                        <Text style={styles.priceSubValue}>{formatGel(clientGelParsed)}</Text>
                      </View>
                      {commissionGelPreview > 0 ? (
                        <View style={styles.priceSplit}>
                          <Text style={styles.priceSubLabel}>კომისია (₾)</Text>
                          <Text style={styles.priceSubValue}>{formatGel(commissionGelPreview)}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.priceSplit, styles.priceIncomeRow]}>
                        <Text style={styles.priceIncomeLabel}>თქვენი შემოსავალი</Text>
                        <Text style={styles.priceIncomeValue}>{formatGel(companyIncomePreview)}</Text>
                      </View>
                    </>
                  ) : null}
                  <Text style={styles.priceNote}>
                    საბოლოო ფასი დადასტურდება მენეჯერის მიერ. ჩათვლილია მგზავრები: {pax}, კლასი:{' '}
                    {vehicleClass}.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.priceLabel}>სავარაუდო ფასი</Text>
                  <Text style={styles.priceBig}>{formatGel(price)}</Text>
                  <Text style={styles.priceNote}>
                    საბოლოო ფასი დადასტურდება მენეჯერის მიერ. ჩათვლილია მგზავრები: {pax}, კლასი:{' '}
                    {vehicleClass}.
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.fieldLabel}>გადახდის მეთოდი</Text>
            {(['ახლა', 'შემდეგ', 'კლიენტის ბარათით'] as PaymentWhen[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPaymentWhen(p)}
                style={[styles.payRow, paymentWhen === p && styles.payRowActive]}
              >
                <Text style={[styles.payText, paymentWhen === p && styles.payTextActive]}>{p}</Text>
              </Pressable>
            ))}
            <View style={[styles.voucher, SHADOWS.gold, styles.voucherSpaced]}>
              <Text style={styles.voucherTitle}>ვაუჩერი</Text>
              <Text style={styles.voucherId}>{previewVoucherId}</Text>
              <View style={styles.vDivider} />
              <Text style={styles.vLine}>ტიპი: {TYPE_LABELS[bookingType]}</Text>
              {bookingType === 'transfer' ? (
                <>
                  <Text style={styles.vLine}>
                    {fromPlace} → {toPlace}
                  </Text>
                  <Text style={styles.vLine}>{dateStr}</Text>
                  {passengerName.trim() ? (
                    <Text style={styles.vLineMuted}>მგზავრი: {passengerName.trim()}</Text>
                  ) : null}
                  {passengerPhone.trim() ? (
                    <Text style={styles.vLineMuted}>ტელ: {passengerPhone.trim()}</Text>
                  ) : null}
                  {meetGreet ? (
                    <Text style={styles.vLineMuted}>
                      დასახვედრი პლაკატი: დიახ
                      {signText.trim() ? ` — „${signText.trim()}“` : ''}
                    </Text>
                  ) : null}
                  {flightNo.trim() || pickupTime.trim() ? (
                    <Text style={styles.vLineMuted}>
                      {flightNo.trim() ? `ფრენა ${flightNo.trim()}` : 'ფრენა —'} (
                      {flightDirection === 'arrival' ? 'ჩამოსვლა' : 'გამგზავრება'})
                      {pickupTime.trim() ? ` · აყვანა ${pickupTime.trim()}` : ''}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  {(transferIn.date.trim() ||
                    transferIn.flight.trim() ||
                    transferIn.passengerName.trim()) && (
                    <Text style={styles.vLineMuted}>
                      ჩამოსვლა: {transferIn.date.trim() || '—'} · ფრენა {transferIn.flight.trim() || '—'}{' '}
                      · {transferIn.passengerName.trim() || '—'}
                    </Text>
                  )}
                  {tourDays.map((d, idx) => (
                    <Text key={d.id} style={styles.vLineMuted}>
                      დღე {idx + 1}: {d.fromPlace.trim() || '—'} → {d.toPlace.trim() || '—'}
                      {d.date.trim() ? ` · ${d.date.trim()}` : ''}
                      {d.stops.some((s) => s.trim())
                        ? ` · გაჩერებები: ${d.stops
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .join(', ')}`
                        : ''}
                      {d.overnight ? ' · ღამისთევა' : ''}
                    </Text>
                  ))}
                  {(transferOut.date.trim() ||
                    transferOut.flight.trim() ||
                    transferOut.passengerName.trim()) && (
                    <Text style={styles.vLineMuted}>
                      გამგზავრება: {transferOut.date.trim() || '—'} · ფრენა{' '}
                      {transferOut.flight.trim() || '—'} · {transferOut.passengerName.trim() || '—'}
                    </Text>
                  )}
                </>
              )}
              <Text style={styles.vLine}>მგზავრები: {pax}</Text>
              <Text style={styles.vLine}>კლასი: {vehicleClass}</Text>
              <Text style={styles.vLine}>გადახდა: {paymentWhen}</Text>
              {bookingType === 'transfer' && clientGelParsed > 0 ? (
                <>
                  <Text style={styles.vLineMuted}>კლიენტის ფასი: {formatGel(clientGelParsed)}</Text>
                  {commissionGelPreview > 0 ? (
                    <Text style={styles.vLineMuted}>კომისია: {formatGel(commissionGelPreview)}</Text>
                  ) : null}
                  <Text style={styles.vLineMuted}>შემოსავალი: {formatGel(companyIncomePreview)}</Text>
                </>
              ) : null}
              <Text style={styles.vPrice}>მძღოლი: {formatGel(price)}</Text>
            </View>
            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
            <Text style={styles.doneHint}>
              დააჭირეთ შენახვას — ჯავშანი Supabase-ში ინახება და მძღოლებს რეალურ დროში გამოჩნდება.
            </Text>
          </View>
        )}

        <View style={styles.navRow}>
          {step > 1 && (
            <Pressable
              onPress={() => setStep((s) => Math.max(1, s - 1))}
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
            >
              <Text style={styles.btnSecondaryText}>უკან</Text>
            </Pressable>
          )}
          {step < 3 && (
            <Pressable
              onPress={() => {
                if (step === 2 && !canAdvanceFrom2()) return;
                setStep((s) => Math.min(3, s + 1));
              }}
              style={({ pressed }) => [
                styles.btnPrimary,
                step === 1 && styles.btnPrimarySolo,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.btnPrimaryText}>შემდეგი</Text>
            </Pressable>
          )}
          {step === 3 && (
            <Pressable
              onPress={() => void confirmAndSaveBooking()}
              disabled={submitting}
              style={({ pressed }) => [
                styles.btnPrimary,
                styles.btnPrimarySolo,
                (pressed || submitting) && styles.pressed,
                submitting && styles.btnDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.btnPrimaryText}>ჯავშნის შენახვა</Text>
              )}
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
  logo: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    color: COLORS.white,
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
  tourDayBlock: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.md,
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
    fontSize: 18,
    fontWeight: '700',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  stopInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  stopRemoveBtn: {
    paddingBottom: 14,
    paddingHorizontal: SPACING.xs,
  },
  stopRemoveText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '700',
  },
  addStopBtn: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  addStopBtnText: {
    color: COLORS.goldLight,
    fontSize: 14,
    fontWeight: '700',
  },
  overnightChip: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceHigh,
    marginBottom: SPACING.md,
  },
  overnightChipOn: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.15)',
  },
  overnightChipTextOff: {
    color: COLORS.grayLight,
    fontWeight: '700',
    fontSize: 14,
  },
  overnightChipTextOn: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: 14,
  },
  addDayOutline: {
    borderWidth: 2,
    borderColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  addDayOutlineText: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '800',
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
    color: COLORS.white,
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
    color: COLORS.white,
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
    color: COLORS.white,
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
    color: COLORS.white,
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
    color: COLORS.white,
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
    color: '#000000',
    fontWeight: '800',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.9,
  },
});
