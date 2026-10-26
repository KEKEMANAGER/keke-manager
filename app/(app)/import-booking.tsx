import { Ionicons } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DateOnlyField } from '../../components/DateOnlyField';
import { DateTimeField } from '../../components/DateTimeField';
import { LanguageMultiSelect } from '../../components/LanguageMultiSelect';
import { LocationPicker } from '../../components/LocationPicker';
import { MapLinkField } from '../../components/MapLinkField';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import { insertBooking } from '../../lib/bookings';
import {
  clockOf,
  draftTimeMissing,
  draftToInsertInput,
  flightTimeLabel,
  importBookingFromFile,
  legPlaces,
  MAX_IMPORT_PHOTOS,
  missingRequiredFields,
  parseBookingFile,
  parseBookingPhotos,
  parseBookingText,
  pickBookingPhotos,
  pickupFlightProblem,
  placeFields,
  prepareDroppedFiles,
  presetPlaceName,
  tourNights,
  transferPlaces,
  withFormDefaults,
  type BookingImportFailure,
  type BookingImportResult,
  type ImportedBookingDraft,
  type ImportedLeg,
  type ImportedService,
  type ImportedTourDay,
  type PhotoSource,
  type PickedImage,
} from '../../lib/bookingImport';
import type { LocationValue } from '../../lib/bookingLocations';
import { fetchCompanyMembers, type CompanyMember } from '../../lib/companyMembers';
import { parseStoredDateTime } from '../../lib/dateTime';
import { parseDateOnly, toDateOnlyString } from '../../lib/tourDays';

/**
 * A booking from whatever the tour operator sent: a message pasted from
 * WhatsApp, Viber, Telegram or an email, screenshots or photos, a file, or a
 * chat exported from WhatsApp. In a browser a file can also be dropped on the
 * screen and a screenshot pasted with Ctrl+V.
 *
 * The read result is a DRAFT and nothing more. It is shown here with the SAME
 * fields and the SAME rules as the new-booking form — place types and map
 * links, arrival or departure, the pickup time, a tour's start, end and nights,
 * the price — and the booking is only created through the ordinary
 * `insertBooking` path, so the review gate, the driver-availability check and
 * every other rule still apply exactly as if it had been typed.
 */

type Mode = 'text' | 'photo' | 'file';

/** What the current draft was read from, for the line above the review. */
type ReadSource = { kind: 'text' } | { kind: 'photo'; count: number } | { kind: 'file'; name: string };

const MODES: { key: Mode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'text', icon: 'chatbubble-ellipses-outline' },
  { key: 'photo', icon: 'images-outline' },
  { key: 'file', icon: 'document-attach-outline' },
];

/** Fewer letters than this is not a request yet — most likely an empty paste. */
const MIN_TEXT_CHARS = 8;
/**
 * A long chat is kept from its END — the request being booked is the latest
 * message — so a paste longer than this drops its oldest part, not its newest.
 */
const MAX_TEXT_CHARS = 200_000;

const VEHICLE_TYPES = ['sedan', 'minivan', 'microbus', 'bus', 'suv'] as const;
const VEHICLE_CLASSES = ['economy', 'comfort', 'vip'] as const;
const KINDS = ['transfer', 'day_tour', 'tour'] as const;
const DIRECTIONS = ['arrival', 'departure'] as const;

const EMPTY_LEG: ImportedLeg = { date_display: null, from: null, to: null, flight: null };

function companyDisplayName(profile: Profile | null, user: User | null): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? null;
}

function ddmm(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Short label for a service tab — the date is what tells two transfers apart. */
function formatImportedDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  return ddmm(new Date(t));
}

/** YYYY-MM-DD moved by whole days, on the calendar rather than the clock. */
function addDaysToDateOnly(date: string, days: number): string {
  const d = parseDateOnly(date);
  if (!d) return date;
  d.setDate(d.getDate() + days);
  return toDateOnlyString(d);
}

function shiftLeg(leg: ImportedLeg | null | undefined, days: number): ImportedLeg | null {
  if (!leg) return null;
  const move = (iso: string | null | undefined) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) ? new Date(at + days * 86_400_000).toISOString() : iso ?? null;
  };
  return { ...leg, date_display: move(leg.date_display), flight_at: move(leg.flight_at) };
}

/** A tour's earliest dated day, YYYY-MM-DD. */
function firstDayDate(d: ImportedBookingDraft): string | null {
  const dates = (d.tour_days ?? []).map((x) => x.date).filter((x): x is string => !!x).sort();
  return dates[0] ?? null;
}

function localDayNumber(d: Date): number {
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/** That calendar day at that clock time, both in local time. */
function atClock(day: Date, clock: Date | null): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (clock) d.setHours(clock.getHours(), clock.getMinutes(), 0, 0);
  return d;
}

function formatGel(n: number): string {
  try {
    return `${n.toLocaleString('ka-GE')} ₾`;
  } catch {
    return `${n} ₾`;
  }
}

/**
 * The place picker clears its name when its type changes, which is right on an
 * empty form and wrong here: the name is what the request said. Correcting
 * "address" to "hotel" keeps "Rooms Hotel" instead of asking for it again.
 */
function keepNameOnTypeChange(prev: LocationValue, next: LocationValue): LocationValue {
  if (next.type !== prev.type && !next.name.trim() && prev.name.trim()) {
    return { ...next, name: presetPlaceName(next.type, prev.name.trim()) };
  }
  return next;
}

/** "AI guess" next to a field the model filled rather than the template. */
function AiTag({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <View style={styles.aiTag}>
      <Text style={styles.aiTagText}>{label}</Text>
    </View>
  );
}

/**
 * What the request actually said, under the field it produced. Checking a
 * quoted line takes a second; going back to the chat to check takes a minute,
 * so without this nobody checks at all.
 */
function Quote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Text style={styles.evidence} numberOfLines={2}>
      «{text}»
    </Text>
  );
}

/*
 * The review fields live out here, not inside the screen: a component declared
 * in the screen's body is a new type on every render, so React would replace
 * the input — and drop the keyboard — after every letter typed.
 */
function ReviewField({
  label,
  aiLabel,
  fromAi,
  quote,
  value,
  onChange,
  keyboardType,
  placeholder,
  multiline,
  required,
  testID,
}: {
  label: string;
  aiLabel: string;
  fromAi: boolean;
  quote: string | null;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
  placeholder?: string;
  multiline?: boolean;
  /** Empty and required: the field says so before the create button does. */
  required?: boolean;
  testID?: string;
}) {
  const empty = required && !value.trim();
  return (
    <View style={styles.field} testID={testID}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, empty && styles.fieldLabelRequired]}>
          {label}
          {required ? ' *' : ''}
        </Text>
        <AiTag show={fromAi} label={aiLabel} />
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, empty && styles.inputRequired]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />
      <Quote text={quote} />
    </View>
  );
}

function ReviewChips({
  label,
  aiLabel,
  fromAi,
  options,
  value,
  onPick,
  labelFor,
  required,
}: {
  label: string;
  aiLabel: string;
  fromAi: boolean;
  options: readonly string[];
  value: string | null;
  onPick: (v: string) => void;
  labelFor: (v: string) => string;
  required?: boolean;
}) {
  const empty = required && !value;
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, empty && styles.fieldLabelRequired]}>
          {label}
          {required ? ' *' : ''}
        </Text>
        <AiTag show={fromAi} label={aiLabel} />
      </View>
      <View style={styles.chips}>
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <Pressable
              key={opt}
              style={[styles.chip, isActive ? styles.chipActive : null]}
              onPress={() => onPick(opt)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                {labelFor(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A date and its clock time as two fields. A request that gave only the date
 * leaves the time box EMPTY and red — never a made-up 00:00 the driver would
 * be sent at — and the booking cannot be created until it is filled.
 */
function DateAndTime({
  dateLabel,
  timeLabel,
  iso,
  timeKnown,
  onChange,
  requiredLabel,
  placeholder,
  testID,
}: {
  dateLabel: string;
  timeLabel: string;
  iso: string | null;
  timeKnown: boolean;
  onChange: (iso: string | null, clock: string | null) => void;
  requiredLabel: string;
  placeholder: string;
  testID?: string;
}) {
  const value = parseStoredDateTime(iso);
  const timeMissing = !!value && !timeKnown;
  return (
    <View style={styles.row2} testID={testID}>
      <View style={styles.half}>
        <DateOnlyField
          label={`${dateLabel} *`}
          value={value}
          onChange={(day) => {
            if (!day) {
              onChange(null, null);
              return;
            }
            const next = atClock(day, timeKnown ? value : null);
            onChange(next.toISOString(), timeKnown && value ? clockOf(next) : null);
          }}
        />
      </View>
      <View style={styles.half}>
        <DateTimeField
          mode="time"
          label={`${timeLabel} *`}
          value={timeKnown ? value : null}
          onChange={(clock) => {
            if (!clock) return;
            const next = atClock(value ?? new Date(), clock);
            onChange(next.toISOString(), clockOf(next));
          }}
          placeholder={placeholder}
        />
        {timeMissing ? <Text style={styles.requiredNote}>{requiredLabel}</Text> : null}
      </View>
    </View>
  );
}

/** A departure's flight time beside its pickup, and what is wrong between them. */
function FlightLine({
  flightAt,
  pickupIso,
  pickupKnown,
}: {
  flightAt: string | null | undefined;
  pickupIso: string | null;
  pickupKnown: boolean;
}) {
  const { t } = useTranslation();
  if (!flightAt) return null;
  const label = flightTimeLabel(flightAt, pickupIso);
  if (!label) return null;
  const problem = pickupKnown ? pickupFlightProblem(pickupIso, flightAt) : null;
  const hours = pickupIso ? Math.round((Date.parse(flightAt) - Date.parse(pickupIso)) / 3_600_000) : 0;
  return (
    <View style={styles.flightBox}>
      <Text style={styles.flightText}>{t('importBooking.flightAt', { time: label })}</Text>
      {!pickupKnown ? <Text style={styles.flightHint}>{t('importBooking.pickupHint')}</Text> : null}
      {problem === 'after' ? <Text style={styles.requiredNote}>{t('importBooking.pickupAfterFlight')}</Text> : null}
      {problem === 'early' ? <Text style={styles.flightWarn}>{t('importBooking.pickupEarly', { hours })}</Text> : null}
    </View>
  );
}

/** The form's place picker, with the reader's own words under it. */
function PlaceField({
  label,
  value,
  onChange,
  aiLabel,
  fromAi,
  quote,
  testID,
}: {
  label: string;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  aiLabel: string;
  fromAi: boolean;
  quote: string | null;
  testID?: string;
}) {
  return (
    <View style={styles.placeField} testID={testID}>
      <LocationPicker
        label={`${label} *`}
        value={value}
        onChange={(next) => onChange(keepNameOnTypeChange(value, next))}
        showMapLink
      />
      {fromAi || quote ? (
        <View style={styles.placeMeta}>
          <AiTag show={fromAi} label={aiLabel} />
          <Quote text={quote} />
        </View>
      ) : null}
    </View>
  );
}

/** Two choices side by side — the form's own yes/no and who-arranges switches. */
function TwoChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  testID?: string;
}) {
  return (
    <View style={styles.field} testID={testID}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segment}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ImportBookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [mode, setMode] = useState<Mode>('text');
  /** Kept after a read, so "change" brings the same message back to fix and re-read. */
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * A tour operator's request is often a whole programme, not one job. Everything
   * below therefore edits one service out of a list — a single-booking request
   * is simply a list of one.
   */
  const [services, setServices] = useState<ImportedService[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Services already sent, so a second tap cannot duplicate them. */
  const [createdIndexes, setCreatedIndexes] = useState<number[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [readSource, setReadSource] = useState<ReadSource | null>(null);
  /** A file being dragged over the window (browser only). */
  const [dragActive, setDragActive] = useState(false);

  /** Who is booking it — the form's operator choice, from the company's own list. */
  const [operators, setOperators] = useState<CompanyMember[]>([]);
  const [operatorName, setOperatorName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void fetchCompanyMembers(user.id)
      .then(({ data, error }) => {
        if (!alive || error) return;
        const list = Array.isArray(data) ? data : [];
        setOperators(list);
        setOperatorName((prev) => (prev && list.some((m) => m.name === prev) ? prev : list[0]?.name ?? null));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const active = services[activeIndex] ?? null;
  const draft = active?.draft ?? null;
  const sources = active?.sources ?? {};
  const evidence = active?.evidence ?? null;
  const kind = draft?.kind ?? 'transfer';
  const isTour = kind === 'tour';
  const isDayTour = kind === 'day_tour';
  const isTransfer = !isTour && !isDayTour;
  const tourDays = draft?.tour_days ?? [];
  /** A sign is held at an arrival: any transfer, or a tour that opens with one. */
  const showMeetGreet = isTransfer || !!draft?.transfer_in || draft?.meet_greet === true;
  const pendingIndexes = services
    .map((_, i) => i)
    .filter((i) => !createdIndexes.includes(i));

  /**
   * The answer's top-level warnings repeat the first service's own. Shown here:
   * the ones about the whole read, then the ones about the service on screen —
   * so the second transfer's tab is not showing the first one's missing date.
   */
  const firstServiceWarnings = services[0]?.warnings ?? [];
  const shownWarnings = [
    ...new Set([
      ...warnings.filter((w) => !firstServiceWarnings.includes(w)),
      ...(active?.warnings ?? []),
    ]),
  ];

  /** react-native-web's Alert shows nothing, so the browser gets its own. */
  function notify(title: string, message: string, onClose?: () => void) {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
      onClose?.();
      return;
    }
    Alert.alert(title, message, onClose ? [{ text: t('common.ok'), onPress: onClose }] : undefined);
  }

  function patchDraft(update: (d: ImportedBookingDraft) => ImportedBookingDraft) {
    setServices((prev) =>
      prev.map((s, i) => (i === activeIndex ? { ...s, draft: update(s.draft) } : s)),
    );
  }

  function patch(changes: Partial<ImportedBookingDraft>) {
    patchDraft((d) => ({ ...d, ...changes }));
  }

  function patchDay(index: number, changes: Partial<ImportedTourDay>) {
    patchDraft((d) => ({
      ...d,
      tour_days: (d.tour_days ?? []).map((day, i) => (i === index ? { ...day, ...changes } : day)),
    }));
  }

  function removeDay(index: number) {
    patchDraft((d) => {
      const days = (d.tour_days ?? [])
        .filter((_, i) => i !== index)
        .map((day, i) => ({ ...day, day: i + 1 }));
      return { ...d, tour_days: days.length > 0 ? days : null };
    });
  }

  function blankDay(day: number, date: string | null): ImportedTourDay {
    return { day, date, fromPlace: null, toPlace: null, stops: null, hotel: null };
  }

  /** One more day, dated the day after the last one. */
  function addDay() {
    patchDraft((d) => {
      const days = d.tour_days ?? [];
      const last = days[days.length - 1];
      const start = parseStoredDateTime(d.date_display);
      const date = last?.date
        ? addDaysToDateOnly(last.date, 1)
        : start
          ? toDateOnlyString(start)
          : null;
      return { ...d, tour_days: [...days, blankDay(days.length + 1, date)] };
    });
  }

  function patchLeg(key: 'transfer_in' | 'transfer_out', changes: Partial<ImportedLeg> | null) {
    patchDraft((d) =>
      changes === null ? { ...d, [key]: null } : { ...d, [key]: { ...(d[key] ?? EMPTY_LEG), ...changes } },
    );
  }

  /**
   * A new start date carries the whole tour with it: its days and its
   * transfers move by the same number of days. Fixing a year the message
   * did not state is then one change, not six.
   */
  function onTourStartChange(next: Date | null) {
    patchDraft((d) => {
      const updated: ImportedBookingDraft = {
        ...d,
        date_display: next ? atClock(next, null).toISOString() : null,
        pickup_time: null,
      };
      // Moved from the start shown on screen: the first day, or the booking's date.
      const before = parseDateOnly(firstDayDate(d)) ?? parseStoredDateTime(d.date_display);
      if (!next || !before) return updated;
      const shift = localDayNumber(next) - localDayNumber(before);
      if (shift === 0) return updated;
      return {
        ...updated,
        tour_days: d.tour_days
          ? d.tour_days.map((day) => (day.date ? { ...day, date: addDaysToDateOnly(day.date, shift) } : day))
          : null,
        transfer_in: shiftLeg(d.transfer_in, shift),
        transfer_out: shiftLeg(d.transfer_out, shift),
      };
    });
  }

  /**
   * The form's "end date": the days run from the start to here, one a day. Days
   * already filled keep what is in them; days past the new end go.
   */
  function onTourEndChange(next: Date | null) {
    if (!next) return;
    patchDraft((d) => {
      const days = d.tour_days ?? [];
      const start = parseDateOnly(firstDayDate(d)) ?? parseStoredDateTime(d.date_display);
      if (!start) return d;
      const count = localDayNumber(next) - localDayNumber(start) + 1;
      if (count < 1 || count > 45) return d;
      const startDay = toDateOnlyString(start);
      const rebuilt = Array.from({ length: count }, (_, i) => {
        const date = addDaysToDateOnly(startDay, i);
        const kept = days.find((x) => x.date === date) ?? days[i];
        return kept ? { ...kept, day: i + 1, date } : blankDay(i + 1, date);
      });
      return { ...d, tour_days: rebuilt };
    });
  }

  function onKindChange(next: string) {
    patchDraft((d) => withFormDefaults({ ...d, kind: next as ImportedBookingDraft['kind'] }));
  }

  function showResult(res: BookingImportResult | BookingImportFailure, source: ReadSource) {
    if (!res.ok) {
      notify(t('importBooking.readFailed'), res.error);
      return;
    }
    const list: ImportedService[] =
      res.services ?? [{ draft: res.draft, sources: res.sources ?? {}, warnings: res.warnings ?? [] }];
    // The form's defaults where the request said nothing — comfort, fuel
    // included, KEKE arranging the driver's nights — all visible and editable.
    setServices(list.map((s) => ({ ...s, draft: withFormDefaults(s.draft) })));
    setActiveIndex(0);
    setCreatedIndexes([]);
    setWarnings(res.warnings ?? []);
    setUsedAi(res.usedAi);
    setReadSource(source);
  }

  /** Back to the inputs. The pasted message stays, ready to be fixed and read again. */
  function startOver() {
    setServices([]);
    setActiveIndex(0);
    setCreatedIndexes([]);
    setWarnings([]);
    setUsedAi(false);
    setReadSource(null);
  }

  async function onReadText() {
    if (busy) return;
    const value = text.trim();
    if (value.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
      notify(t('importBooking.readFailed'), t('importBooking.textTooShort'));
      return;
    }
    setBusy(true);
    const res = await parseBookingText(value);
    setBusy(false);
    showResult(res, { kind: 'text' });
  }

  async function onPickPhotos(source: PhotoSource) {
    if (busy) return;
    let images: PickedImage[] | null;
    try {
      images = await pickBookingPhotos(source);
    } catch (e) {
      notify(t('importBooking.readFailed'), e instanceof Error ? e.message : String(e));
      return;
    }
    if (!images) return; // cancelled
    setBusy(true);
    const res = await parseBookingPhotos(images);
    setBusy(false);
    showResult(res, { kind: 'photo', count: images.length });
  }

  async function onPickFile() {
    if (busy) return;
    let name = '';
    const res = await importBookingFromFile((file) => {
      name = file.name;
      setBusy(true);
    });
    setBusy(false);
    if (res === null) return; // cancelled
    showResult(res, { kind: 'file', name });
  }

  /** A file dropped on the window, or a screenshot pasted with Ctrl+V. */
  async function onDropped(files: File[]) {
    if (busy || services.length > 0) return;
    setBusy(true);
    try {
      const input = await prepareDroppedFiles(files);
      if (!input) return;
      if (input.kind === 'photos') {
        setMode('photo');
        showResult(await parseBookingPhotos(input.images), { kind: 'photo', count: input.images.length });
      } else {
        setMode('file');
        showResult(await parseBookingFile(input.file), { kind: 'file', name: input.file.name });
      }
    } catch (e) {
      notify(t('importBooking.readFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** The latest handlers, for listeners registered once per input state. */
  const droppedRef = useRef(onDropped);
  droppedRef.current = onDropped;

  const listening = Platform.OS === 'web' && !draft && !busy;

  /**
   * In a browser the whole window takes a file: drag a PDF or a WhatsApp export
   * from the desktop, or press Ctrl+V with a screenshot on the clipboard. Text
   * pasted while no box is focused lands in the message box.
   */
  useEffect(() => {
    if (!listening || typeof window === 'undefined') return;
    let depth = 0;
    const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragActive(false);
      void droppedRef.current(Array.from(e.dataTransfer?.files ?? []));
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        e.preventDefault();
        void droppedRef.current(files);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable);
      const pasted = e.clipboardData?.getData('text/plain') ?? '';
      if (!typing && pasted.trim()) {
        e.preventDefault();
        setMode('text');
        setText(pasted.length > MAX_TEXT_CHARS ? pasted.slice(-MAX_TEXT_CHARS) : pasted);
      }
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
      setDragActive(false);
    };
  }, [listening]);

  function serviceLabel(service: ImportedService, index: number): string {
    const d = service.draft;
    const days = (d.tour_days ?? []).map((x) => x.date).filter((x): x is string => !!x).sort();
    const date =
      d.kind === 'tour' && days.length > 1
        ? `${days[0].slice(8, 10)}.${days[0].slice(5, 7)}–${days[days.length - 1].slice(8, 10)}.${days[days.length - 1].slice(5, 7)}`
        : d.date_display
          ? formatImportedDate(d.date_display)
          : '';
    const route =
      d.kind === 'tour'
        ? t('importBooking.kinds.tour')
        : [d.from_location, d.to_location].filter(Boolean).join(' → ') || d.route || '';
    const label = [date, route].filter(Boolean).join(' · ');
    return label || `${t('importBooking.serviceLabel')} ${index + 1}`;
  }

  /**
   * Sends every service that has not been sent yet. That is the point of reading
   * a programme: a company that still has to open five forms has been saved
   * nothing. A service that is missing something required stops the run and the
   * screen jumps to it, rather than sending a half-correct batch.
   */
  async function onCreate() {
    if (!user?.id || submitting || pendingIndexes.length === 0) return;

    if (operators.length > 0 && !operatorName) {
      notify(t('importBooking.missingTitle'), t('newBooking.validation.operator'));
      return;
    }

    for (const i of pendingIndexes) {
      const missing = missingRequiredFields(services[i].draft);
      if (missing.length > 0) {
        setActiveIndex(i);
        notify(
          t('importBooking.missingTitle'),
          services.length > 1
            ? `${serviceLabel(services[i], i)}\n\n${missing.map((m) => `• ${m}`).join('\n')}`
            : missing.map((m) => `• ${m}`).join('\n'),
        );
        return;
      }
    }

    setSubmitting(true);
    const done: number[] = [];
    let failure: string | null = null;

    for (const i of pendingIndexes) {
      // Field for field what the new-booking form sends for the same booking.
      const payload = draftToInsertInput(services[i].draft, {
        companyUserId: user.id,
        companyName: companyDisplayName(profile, user),
        createdByName: operatorName ?? profile?.full_name ?? null,
      });

      const { id, error } = await insertBooking(payload);
      if (error || !id) {
        failure = error?.message ?? t('importBooking.createFailed');
        break;
      }
      done.push(i);
    }

    setCreatedIndexes((prev) => [...prev, ...done]);
    setSubmitting(false);

    if (failure) {
      // Whatever went out stays out — say how much, so nobody re-sends it.
      notify(
        t('common.error'),
        done.length > 0
          ? `${t('importBooking.createdSome', { count: done.length })}\n\n${failure}`
          : failure,
      );
      return;
    }

    notify(
      t('common.success'),
      done.length > 1 ? t('importBooking.createdMany', { count: done.length }) : t('importBooking.created'),
      () => {
        // "Back" now returns to the previous screen, so this one is cleared
        // rather than left showing a request that is already sent.
        startOver();
        setText('');
        router.replace('/(app)/dashboard');
      },
    );
  }

  const fromAi = (field: keyof ImportedBookingDraft) => sources[field] === 'ai';
  /** The request's own words for a field, keyed by the reader's field names. */
  const quote = (field: keyof ImportedBookingDraft): string | null => {
    if (field === 'date_display') {
      return [evidence?.date, evidence?.time].filter(Boolean).join(' · ') || null;
    }
    return evidence?.[field] ?? null;
  };
  const aiLabel = t('importBooking.aiGuessed');

  function sourceLine(source: ReadSource): { icon: keyof typeof Ionicons.glyphMap; text: string } {
    if (source.kind === 'text') return { icon: 'chatbubble-ellipses-outline', text: t('importBooking.sourceText') };
    if (source.kind === 'photo') {
      return { icon: 'images-outline', text: t('importBooking.sourcePhotos', { count: source.count }) };
    }
    return { icon: 'document-attach-outline', text: source.name };
  }

  const textReady = text.replace(/\s/g, '').length >= MIN_TEXT_CHARS;
  const readFrom = readSource ? sourceLine(readSource) : null;

  // ------------------------------------------------------------ review parts

  const places = draft && isTransfer ? transferPlaces(draft) : null;
  const pickupKnown = !!draft && !draftTimeMissing(draft.date_display, draft.pickup_time);
  const sortedDayDates = tourDays.map((d) => d.date).filter((d): d is string => !!d).sort();
  const tourStart = parseDateOnly(sortedDayDates[0] ?? null) ?? parseStoredDateTime(draft?.date_display);
  const tourEnd = parseDateOnly(sortedDayDates[sortedDayDates.length - 1] ?? null);
  const nights = draft ? tourNights(draft) : 0;
  const price = draft?.client_price ?? null;

  const timeLabel =
    isTransfer && draft?.flight_direction === 'arrival'
      ? t('importBooking.timeArrival')
      : isTransfer && draft?.flight_direction === 'departure'
        ? t('importBooking.timePickup')
        : t('importBooking.time');

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl * 2 }]}
        keyboardShouldPersistTaps="handled"
        // A swipe puts the phone keyboard away. Not in a browser: there any
        // scroll — even the page bringing the field into view — would blur the
        // field being typed in.
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('importBooking.title')}</Text>
          <Text style={styles.subtitle}>{t('importBooking.subtitle')}</Text>
        </View>

        {!draft ? (
          <>
            <View style={styles.modeTabs}>
              {MODES.map((m) => {
                const isActive = mode === m.key;
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => setMode(m.key)}
                    disabled={busy}
                    style={[styles.modeTab, isActive && styles.modeTabActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Ionicons
                      name={m.icon}
                      size={20}
                      color={isActive ? COLORS.goldDark : COLORS.textSecondary}
                    />
                    <Text style={[styles.modeTabText, isActive && styles.modeTabTextActive]}>
                      {t(`importBooking.modes.${m.key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'text' ? (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardLabel}>{t('importBooking.textLabel')}</Text>
                  {text.length > 0 && !busy ? (
                    <Pressable onPress={() => setText('')} hitSlop={8}>
                      <Text style={styles.linkText}>{t('importBooking.clear')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={text}
                  onChangeText={(v) => setText(v.length > MAX_TEXT_CHARS ? v.slice(-MAX_TEXT_CHARS) : v)}
                  placeholder={t('importBooking.textPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  textAlignVertical="top"
                  autoCorrect={false}
                  editable={!busy}
                  style={styles.textArea}
                />
                <Pressable
                  style={[styles.readBtn, (busy || !textReady) && styles.btnDisabled]}
                  disabled={busy || !textReady}
                  onPress={() => void onReadText()}
                >
                  {busy ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color={COLORS.white} />
                      <Text style={styles.readBtnText}>{t('importBooking.readText')}</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.hint}>{t('importBooking.textHint')}</Text>
              </View>
            ) : null}

            {mode === 'photo' ? (
              <View style={styles.card}>
                <Pressable
                  style={[styles.bigBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void onPickPhotos('library')}
                >
                  <Ionicons name="images-outline" size={24} color={COLORS.goldDark} />
                  <View style={styles.bigBtnTextWrap}>
                    <Text style={styles.bigBtnTitle}>{t('importBooking.photoLibrary')}</Text>
                    <Text style={styles.bigBtnSub}>
                      {t('importBooking.photoLibrarySub', { count: MAX_IMPORT_PHOTOS })}
                    </Text>
                  </View>
                </Pressable>
                {Platform.OS !== 'web' ? (
                  <Pressable
                    style={[styles.bigBtn, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={() => void onPickPhotos('camera')}
                  >
                    <Ionicons name="camera-outline" size={24} color={COLORS.goldDark} />
                    <View style={styles.bigBtnTextWrap}>
                      <Text style={styles.bigBtnTitle}>{t('importBooking.photoCamera')}</Text>
                      <Text style={styles.bigBtnSub}>{t('importBooking.photoCameraSub')}</Text>
                    </View>
                  </Pressable>
                ) : null}
                <Text style={styles.hint}>{t('importBooking.photoHint')}</Text>
                {Platform.OS === 'web' ? <Text style={styles.hint}>{t('importBooking.dropHint')}</Text> : null}
              </View>
            ) : null}

            {mode === 'file' ? (
              <View style={styles.card}>
                <Pressable
                  style={[styles.pickBtn, busy ? styles.btnDisabled : null]}
                  disabled={busy}
                  onPress={() => void onPickFile()}
                >
                  <Text style={styles.pickBtnText}>{t('importBooking.pick')}</Text>
                </Pressable>
                <Text style={styles.hint}>{t('importBooking.formatsHint')}</Text>
                {Platform.OS === 'web' ? <Text style={styles.hint}>{t('importBooking.dropHint')}</Text> : null}
              </View>
            ) : null}

            {busy ? (
              <View style={styles.readingBox}>
                <ActivityIndicator color={COLORS.goldDark} />
                <Text style={styles.readingText}>{t('importBooking.reading')}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.fileRow}>
              {readFrom ? (
                <Ionicons name={readFrom.icon} size={16} color={COLORS.textSecondary} />
              ) : null}
              <Text style={styles.fileName} numberOfLines={1}>
                {readFrom?.text ?? ''}
              </Text>
              {usedAi ? (
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>{t('importBooking.aiUsed')}</Text>
                </View>
              ) : (
                <View style={styles.templateTag}>
                  <Text style={styles.templateTagText}>{t('importBooking.templateUsed')}</Text>
                </View>
              )}
              <Pressable onPress={startOver} disabled={submitting} hitSlop={8}>
                <Text style={styles.linkText}>{t('importBooking.change')}</Text>
              </Pressable>
            </View>

            {shownWarnings.length > 0 ? (
              <View style={styles.warnBox}>
                {shownWarnings.map((w) => (
                  <Text key={w} style={styles.warnText}>
                    • {w}
                  </Text>
                ))}
              </View>
            ) : null}

            {services.length > 1 ? (
              <View style={styles.serviceTabs}>
                {services.map((s, i) => {
                  const isActive = i === activeIndex;
                  const isCreated = createdIndexes.includes(i);
                  return (
                    <Pressable
                      key={`service-${i}`}
                      onPress={() => setActiveIndex(i)}
                      style={[
                        styles.serviceTab,
                        isActive && styles.serviceTabActive,
                        isCreated && styles.serviceTabDone,
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.serviceTabText, isActive && styles.serviceTabTextActive]}
                      >
                        {isCreated ? '✅ ' : ''}
                        {i + 1}. {serviceLabel(s, i)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.card}>
              <ReviewChips
                label={t('importBooking.kind')}
                aiLabel={aiLabel}
                fromAi={fromAi('kind')}
                options={KINDS}
                value={kind}
                onPick={onKindChange}
                labelFor={(v) => t(`importBooking.kinds.${v}`)}
              />

              {isTransfer ? (
                <ReviewChips
                  label={t('importBooking.direction')}
                  aiLabel={aiLabel}
                  fromAi={fromAi('flight_direction')}
                  options={DIRECTIONS}
                  value={draft.flight_direction}
                  onPick={(v) =>
                    patch({
                      flight_direction:
                        draft.flight_direction === v ? null : (v as ImportedBookingDraft['flight_direction']),
                    })
                  }
                  labelFor={(v) => t(`newBooking.transferTab.${v}`)}
                />
              ) : null}

              {isTour ? (
                <View style={styles.row2}>
                  <View style={styles.half} testID="tour-start">
                    <DateOnlyField
                      key={`start-${activeIndex}`}
                      label={`${t('importBooking.tourStart')} *`}
                      value={tourStart}
                      onChange={onTourStartChange}
                    />
                  </View>
                  <View style={styles.half} testID="tour-end">
                    <DateOnlyField
                      key={`end-${activeIndex}`}
                      label={t('newBooking.form.tourEndDate')}
                      value={tourEnd}
                      onChange={onTourEndChange}
                    />
                  </View>
                </View>
              ) : (
                <DateAndTime
                  key={`when-${activeIndex}`}
                  testID="when"
                  dateLabel={t('importBooking.dayDate')}
                  timeLabel={timeLabel}
                  iso={draft.date_display}
                  timeKnown={pickupKnown}
                  onChange={(iso, clock) => patch({ date_display: iso, pickup_time: clock })}
                  requiredLabel={t('importBooking.timeRequired')}
                  placeholder={t('importBooking.timePlaceholder')}
                />
              )}
              {fromAi('date_display') || quote('date_display') ? (
                <View style={styles.dateMeta}>
                  <AiTag show={fromAi('date_display')} label={aiLabel} />
                  <Quote text={quote('date_display')} />
                </View>
              ) : null}
              {isTransfer && draft.flight_direction !== 'arrival' ? (
                <FlightLine flightAt={draft.flight_at} pickupIso={draft.date_display} pickupKnown={pickupKnown} />
              ) : null}
              {isTour && tourStart ? (
                <Text style={styles.tourSummary}>
                  {t('importBooking.tourSummary', {
                    start: ddmm(tourStart),
                    end: ddmm(tourEnd ?? tourStart),
                    days: tourDays.length,
                    nights,
                  })}
                </Text>
              ) : null}

              {isTransfer && places ? (
                <>
                  <PlaceField
                    key={`from-${activeIndex}`}
                    testID="place-from"
                    label={t('newBooking.form.pickupLocation')}
                    value={places.from}
                    onChange={(v) => {
                      const f = placeFields(v);
                      patch({ from_location: f.name, from_location_type: f.type, from_location_link: f.link });
                    }}
                    aiLabel={aiLabel}
                    fromAi={fromAi('from_location')}
                    quote={quote('from_location')}
                  />
                  <PlaceField
                    key={`to-${activeIndex}`}
                    testID="place-to"
                    label={t('newBooking.form.dropoffLocation')}
                    value={places.to}
                    onChange={(v) => {
                      const f = placeFields(v);
                      patch({ to_location: f.name, to_location_type: f.type, to_location_link: f.link });
                    }}
                    aiLabel={aiLabel}
                    fromAi={fromAi('to_location')}
                    quote={quote('to_location')}
                  />
                </>
              ) : null}

              {isDayTour ? (
                <>
                  <ReviewField
                    label={t('newBooking.form.tourDescription')}
                    aiLabel={aiLabel}
                    fromAi={fromAi('route')}
                    quote={quote('route')}
                    value={draft.route ?? ''}
                    onChange={(v) => patch({ route: v || null })}
                    multiline
                  />
                  <View style={styles.row2}>
                    <View style={styles.half}>
                      <ReviewField
                        label={t('newBooking.form.from')}
                        aiLabel={aiLabel}
                        fromAi={fromAi('from_location')}
                        quote={quote('from_location')}
                        value={draft.from_location ?? ''}
                        onChange={(v) => patch({ from_location: v || null })}
                      />
                    </View>
                    <View style={styles.half}>
                      <ReviewField
                        label={t('newBooking.form.to')}
                        aiLabel={aiLabel}
                        fromAi={fromAi('to_location')}
                        quote={quote('to_location')}
                        value={draft.to_location ?? ''}
                        onChange={(v) => patch({ to_location: v || null })}
                      />
                    </View>
                  </View>
                </>
              ) : null}

              <ReviewField
                label={t('importBooking.passengers')}
                aiLabel={aiLabel}
                fromAi={fromAi('passengers')}
                quote={quote('passengers')}
                value={draft.passengers != null ? String(draft.passengers) : ''}
                onChange={(v) => {
                  const n = Number(v.replace(/\D/g, ''));
                  patch({ passengers: Number.isFinite(n) && n > 0 ? n : null });
                }}
                keyboardType="decimal-pad"
                required
                testID="pax"
              />

              <ReviewChips
                label={t('importBooking.vehicleType')}
                aiLabel={aiLabel}
                fromAi={fromAi('vehicle_type')}
                options={VEHICLE_TYPES}
                value={draft.vehicle_type}
                onPick={(v) => patch({ vehicle_type: v })}
                labelFor={(v) => t(`importBooking.vehicleTypes.${v}`)}
                required
              />
              <ReviewChips
                label={t('importBooking.vehicleClass')}
                aiLabel={aiLabel}
                fromAi={fromAi('vehicle_class')}
                options={VEHICLE_CLASSES}
                value={draft.vehicle_class}
                onPick={(v) => patch({ vehicle_class: v })}
                labelFor={(v) => t(`importBooking.vehicleClasses.${v}`)}
                required
              />

              <View style={styles.field}>
                <LanguageMultiSelect
                  label={t('newBooking.form.requiredLanguages')}
                  value={draft.required_languages ?? []}
                  onChange={(codes) => patch({ required_languages: codes.length > 0 ? codes : null })}
                />
                {fromAi('required_languages') ? (
                  <View style={styles.dateMeta}>
                    <AiTag show label={aiLabel} />
                  </View>
                ) : null}
              </View>

              {/* On a tour the flights belong to its arrival and departure below. */}
              {isTransfer || draft.flight_number ? (
                <ReviewField
                  label={t('importBooking.flight')}
                  aiLabel={aiLabel}
                  fromAi={fromAi('flight_number')}
                  quote={quote('flight_number')}
                  value={draft.flight_number ?? ''}
                  onChange={(v) => patch({ flight_number: v || null })}
                />
              ) : null}
              <ReviewField
                label={t('importBooking.passengerName')}
                aiLabel={aiLabel}
                fromAi={fromAi('passenger_name')}
                quote={quote('passenger_name')}
                value={draft.passenger_name ?? ''}
                onChange={(v) => patch({ passenger_name: v || null })}
              />
              <ReviewField
                label={t('importBooking.phone')}
                aiLabel={aiLabel}
                fromAi={fromAi('passenger_phone')}
                quote={quote('passenger_phone')}
                value={draft.passenger_phone ?? ''}
                onChange={(v) => patch({ passenger_phone: v || null })}
                keyboardType="phone-pad"
              />

              {showMeetGreet ? (
                <View style={styles.switchRow}>
                  <Text style={styles.fieldLabel}>{t('importBooking.meetGreet')}</Text>
                  <Switch
                    value={draft.meet_greet === true}
                    onValueChange={(v) => patch({ meet_greet: v })}
                    trackColor={{ true: COLORS.goldLight, false: COLORS.border }}
                    thumbColor={draft.meet_greet ? COLORS.gold : COLORS.white}
                  />
                </View>
              ) : null}
              {showMeetGreet && draft.meet_greet === true ? (
                <ReviewField
                  label={t('importBooking.sign')}
                  aiLabel={aiLabel}
                  fromAi={fromAi('sign_text')}
                  quote={quote('sign_text')}
                  value={draft.sign_text ?? ''}
                  onChange={(v) => patch({ sign_text: v || null })}
                />
              ) : null}

              {!isTour && draft.hotel ? (
                <ReviewField
                  label={t('importBooking.hotel')}
                  aiLabel={aiLabel}
                  fromAi={fromAi('hotel')}
                  quote={quote('hotel')}
                  value={draft.hotel ?? ''}
                  onChange={(v) => patch({ hotel: v || null })}
                />
              ) : null}

              <ReviewField
                label={t('importBooking.price')}
                aiLabel={aiLabel}
                fromAi={fromAi('client_price')}
                quote={quote('client_price')}
                value={price != null ? String(price) : ''}
                onChange={(v) => {
                  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
                  patch({ client_price: v.trim() && Number.isFinite(n) && n >= 0 ? n : null });
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                required
                testID="price"
              />
              <Text style={styles.priceNote}>
                {price != null && price > 0
                  ? t('newBooking.form.driverOfferNote', { amount: formatGel(price) })
                  : t('importBooking.priceRequired')}
              </Text>

              {!isTransfer ? (
                <TwoChoice
                  testID="fuel"
                  label={t('newBooking.form.priceIncludesFuelLabel')}
                  value={draft.price_includes_fuel === false ? 'no' : 'yes'}
                  options={[
                    { id: 'yes', label: t('newBooking.form.priceIncludesFuelYes') },
                    { id: 'no', label: t('newBooking.form.priceIncludesFuelNo') },
                  ]}
                  onChange={(v) => patch({ price_includes_fuel: v === 'yes' })}
                />
              ) : null}
              {isTour && nights > 0 ? (
                <TwoChoice
                  testID="overnight-by"
                  label={t('newBooking.form.driverOvernightByLabel')}
                  value={draft.driver_overnight_by === 'company' ? 'company' : 'keke'}
                  options={[
                    { id: 'keke', label: t('newBooking.form.driverOvernightByKeke') },
                    { id: 'company', label: t('newBooking.form.driverOvernightByCompany') },
                  ]}
                  onChange={(v) => patch({ driver_overnight_by: v })}
                />
              ) : null}

              {operators.length > 0 ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('newBooking.operator')}</Text>
                  <View style={styles.chips}>
                    {operators.map((m) => {
                      const isActive = operatorName === m.name;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => setOperatorName(m.name)}
                          style={[styles.chip, isActive ? styles.chipActive : null]}
                        >
                          <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>{m.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <ReviewField
                label={t('importBooking.comment')}
                aiLabel={aiLabel}
                fromAi={fromAi('comment')}
                quote={quote('comment')}
                value={draft.comment ?? ''}
                onChange={(v) => patch({ comment: v || null })}
                multiline
              />
            </View>

            {isTour ? (
              <View style={styles.card}>
                <View style={styles.fieldHead}>
                  <Text style={styles.sectionTitle}>{t('importBooking.tourDays')}</Text>
                  <AiTag show={fromAi('tour_days')} label={aiLabel} />
                </View>
                {tourDays.map((day, i) => {
                  const isLast = i === tourDays.length - 1;
                  return (
                    <View key={`day-${activeIndex}-${i}`} style={styles.subBlock} testID={`day-${i}`}>
                      <View style={styles.subHead}>
                        <Text style={styles.subTitle}>{t('newBooking.form.dayN', { n: i + 1 })}</Text>
                        <Pressable onPress={() => removeDay(i)} hitSlop={8}>
                          <Text style={styles.removeText}>{t('importBooking.remove')}</Text>
                        </Pressable>
                      </View>
                      <DateOnlyField
                        key={`day-date-${activeIndex}-${i}`}
                        label={`${t('importBooking.dayDate')} *`}
                        value={parseDateOnly(day.date)}
                        onChange={(v) => patchDay(i, { date: v ? toDateOnlyString(v) : null })}
                      />
                      <ReviewField
                        label={t('newBooking.form.stops')}
                        aiLabel={aiLabel}
                        fromAi={false}
                        quote={null}
                        value={day.stops ?? ''}
                        onChange={(v) => patchDay(i, { stops: v || null })}
                      />
                      <View style={styles.row2}>
                        <View style={styles.half}>
                          <ReviewField
                            label={t('newBooking.form.from')}
                            aiLabel={aiLabel}
                            fromAi={false}
                            quote={null}
                            value={day.fromPlace ?? ''}
                            onChange={(v) => patchDay(i, { fromPlace: v || null })}
                            required={i === 0}
                          />
                        </View>
                        <View style={styles.half}>
                          <ReviewField
                            label={t('newBooking.form.to')}
                            aiLabel={aiLabel}
                            fromAi={false}
                            quote={null}
                            value={day.toPlace ?? ''}
                            onChange={(v) => patchDay(i, { toPlace: v || null })}
                          />
                        </View>
                      </View>
                      {!isLast ? (
                        <>
                          <ReviewField
                            label={t('newBooking.form.touristHotel')}
                            aiLabel={aiLabel}
                            fromAi={false}
                            quote={null}
                            value={day.hotel ?? ''}
                            onChange={(v) => patchDay(i, { hotel: v || null })}
                          />
                          <MapLinkField
                            compact
                            value={day.hotel_link ?? ''}
                            onChangeText={(v) => patchDay(i, { hotel_link: v || null })}
                            placeName={day.hotel ?? ''}
                          />
                          <ReviewField
                            label={t('newBooking.form.driverOvernight')}
                            aiLabel={aiLabel}
                            fromAi={false}
                            quote={null}
                            value={day.driver_overnight ?? ''}
                            onChange={(v) => patchDay(i, { driver_overnight: v || null })}
                            placeholder={t('newBooking.form.placeholders.driverOvernight')}
                          />
                        </>
                      ) : null}
                    </View>
                  );
                })}
                <Pressable onPress={addDay} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+ {t('importBooking.addDay')}</Text>
                </Pressable>
              </View>
            ) : null}

            {isTour ? (
              <View style={styles.card}>
                {(['transfer_in', 'transfer_out'] as const).map((key) => {
                  const leg = draft[key] ?? null;
                  const isIn = key === 'transfer_in';
                  if (!leg) {
                    return (
                      <Pressable key={key} onPress={() => patchLeg(key, {})} style={styles.addBtn}>
                        <Text style={styles.addBtnText}>
                          +{' '}
                          {isIn
                            ? t('newBooking.smartForm.arrivalTransfer')
                            : t('newBooking.smartForm.departureTransfer')}
                        </Text>
                      </Pressable>
                    );
                  }
                  const ends = legPlaces(leg, key);
                  const legTimeKnown = !draftTimeMissing(leg.date_display, leg.pickup_time);
                  return (
                    <View key={key} style={styles.subBlock} testID={`${key}-block`}>
                      <View style={styles.subHead}>
                        <View style={styles.fieldHead}>
                          <Text style={styles.subTitle}>
                            {isIn
                              ? t('newBooking.form.transferArrivalSection')
                              : t('newBooking.form.transferDepartureSection')}
                          </Text>
                          <AiTag show={fromAi(key)} label={aiLabel} />
                        </View>
                        <Pressable onPress={() => patchLeg(key, null)} hitSlop={8}>
                          <Text style={styles.removeText}>{t('importBooking.remove')}</Text>
                        </Pressable>
                      </View>
                      <DateAndTime
                        key={`${key}-${activeIndex}`}
                        dateLabel={t('importBooking.dayDate')}
                        timeLabel={isIn ? t('importBooking.timeArrival') : t('importBooking.timePickup')}
                        iso={leg.date_display}
                        timeKnown={legTimeKnown}
                        onChange={(iso, clock) => patchLeg(key, { date_display: iso, pickup_time: clock })}
                        requiredLabel={t('importBooking.timeRequired')}
                        placeholder={t('importBooking.timePlaceholder')}
                      />
                      {!isIn ? (
                        <FlightLine flightAt={leg.flight_at} pickupIso={leg.date_display} pickupKnown={legTimeKnown} />
                      ) : null}
                      <PlaceField
                        key={`${key}-from-${activeIndex}`}
                        label={isIn ? t('newBooking.form.transferInFrom') : t('newBooking.form.transferOutFrom')}
                        value={ends.from}
                        onChange={(v) => {
                          const f = placeFields(v);
                          patchLeg(key, { from: f.name, from_type: f.type, from_link: f.link });
                        }}
                        aiLabel={aiLabel}
                        fromAi={false}
                        quote={null}
                      />
                      <PlaceField
                        key={`${key}-to-${activeIndex}`}
                        label={isIn ? t('newBooking.form.transferInTo') : t('newBooking.form.transferOutTo')}
                        value={ends.to}
                        onChange={(v) => {
                          const f = placeFields(v);
                          patchLeg(key, { to: f.name, to_type: f.type, to_link: f.link });
                        }}
                        aiLabel={aiLabel}
                        fromAi={false}
                        quote={null}
                      />
                      <ReviewField
                        label={t('importBooking.flight')}
                        aiLabel={aiLabel}
                        fromAi={false}
                        quote={null}
                        value={leg.flight ?? ''}
                        onChange={(v) => patchLeg(key, { flight: v || null })}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Pressable
              style={[
                styles.createBtn,
                (submitting || pendingIndexes.length === 0) && styles.btnDisabled,
              ]}
              disabled={submitting || pendingIndexes.length === 0}
              onPress={() => void onCreate()}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.createBtnText}>
                  {pendingIndexes.length > 1
                    ? t('importBooking.createAll', { count: pendingIndexes.length })
                    : t('importBooking.create')}
                </Text>
              )}
            </Pressable>
            <Text style={styles.hint}>{t('importBooking.reviewHint')}</Text>
          </>
        )}
      </ScrollView>

      {dragActive ? (
        <View style={styles.dropOverlay} pointerEvents="none">
          <View style={styles.dropCard}>
            <Ionicons name="cloud-upload-outline" size={40} color={COLORS.goldDark} />
            <Text style={styles.dropTitle}>{t('importBooking.dropHere')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.md },
  header: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
    ...SHADOWS.card,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  modeTabs: { flexDirection: 'row', gap: SPACING.sm },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  modeTabActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  modeTabText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  modeTabTextActive: { color: COLORS.goldDark },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  linkText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  textArea: {
    minHeight: 150,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  readBtn: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  bigBtnTextWrap: { flex: 1, gap: 2 },
  bigBtnTitle: { color: COLORS.goldDark, fontWeight: '800', fontSize: 15 },
  bigBtnSub: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  readingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  readingText: { fontSize: 13, color: COLORS.textSecondary, flexShrink: 1 },
  pickBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBtnText: { color: COLORS.goldDark, fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fileName: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  aiTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.blueTint,
  },
  aiTagText: { fontSize: 11, fontWeight: '700', color: COLORS.blue },
  templateTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: '#DCFCE7',
  },
  templateTagText: { fontSize: 11, fontWeight: '700', color: '#047857' },
  warnBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    gap: 2,
  },
  warnText: { fontSize: 13, color: '#92400E', lineHeight: 19 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.card,
  },
  field: { gap: 4 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  fieldLabelRequired: { color: COLORS.error },
  dateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: -SPACING.sm,
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
  inputMultiline: { minHeight: 72 },
  inputRequired: { borderColor: COLORS.error },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.goldDark },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  evidence: {
    marginTop: 4,
    fontSize: 12,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    flexShrink: 1,
  },
  requiredNote: { fontSize: 12, fontWeight: '700', color: COLORS.error, marginTop: -SPACING.sm },
  flightBox: {
    backgroundColor: COLORS.blueTint,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    gap: 4,
  },
  flightText: { fontSize: 13, fontWeight: '700', color: COLORS.blue },
  flightHint: { fontSize: 12, color: COLORS.textSecondary },
  flightWarn: { fontSize: 12, fontWeight: '600', color: '#92400E' },
  tourSummary: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  placeField: { gap: 0 },
  placeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
  },
  priceNote: { fontSize: 12, color: COLORS.textSecondary, marginTop: -2 },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  segmentItem: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', backgroundColor: COLORS.white },
  segmentItemActive: { backgroundColor: COLORS.goldTint },
  segmentText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center' },
  segmentTextActive: { color: COLORS.goldDark, fontWeight: '800' },
  serviceTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  serviceTab: {
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    maxWidth: '100%',
  },
  serviceTabActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldLight,
  },
  serviceTabDone: {
    opacity: 0.6,
  },
  serviceTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  serviceTabTextActive: {
    color: COLORS.text,
    fontWeight: '800',
  },
  createBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  subBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  subTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  removeText: { fontSize: 12, fontWeight: '700', color: COLORS.error },
  row2: { flexDirection: 'row', gap: SPACING.sm },
  half: { flex: 1, minWidth: 0 },
  addBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    backgroundColor: COLORS.goldTint,
  },
  addBtnText: { color: COLORS.goldDark, fontWeight: '800', fontSize: 14 },
  dropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 251, 235, 0.92)',
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  dropCard: { alignItems: 'center', gap: SPACING.md, maxWidth: 420 },
  dropTitle: { fontSize: 17, fontWeight: '800', color: COLORS.goldDark, textAlign: 'center' },
});
