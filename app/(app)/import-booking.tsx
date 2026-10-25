import { Ionicons } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { DateTimeField } from '../../components/DateTimeField';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import { insertBooking, type InsertBookingInput } from '../../lib/bookings';
import {
  draftToInsertInput,
  importBookingFromFile,
  MAX_IMPORT_PHOTOS,
  missingRequiredFields,
  parseBookingPhotos,
  parseBookingText,
  pickBookingPhotos,
  type BookingImportFailure,
  type BookingImportResult,
  type ImportedBookingDraft,
  type ImportedService,
  type PhotoSource,
  type PickedImage,
} from '../../lib/bookingImport';
import { parseStoredDateTime } from '../../lib/dateTime';

/**
 * A booking from whatever the tour operator sent: a message pasted from
 * WhatsApp, Viber, Telegram or an email, screenshots or photos, or a file.
 *
 * The read result is a DRAFT and nothing more: it is shown here for the
 * company to check and correct, and the booking is only created through the
 * ordinary `insertBooking` path — so the review gate, the driver-availability
 * check and every other rule still apply exactly as if it had been typed.
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
const MAX_TEXT_CHARS = 60_000;

function companyDisplayName(profile: Profile | null, user: User | null): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? null;
}

/** Short label for a service tab — the date is what tells two transfers apart. */
function formatImportedDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const VEHICLE_TYPES = ['sedan', 'minivan', 'microbus', 'bus', 'suv'] as const;
const VEHICLE_CLASSES = ['economy', 'comfort', 'vip'] as const;
const KINDS = ['transfer', 'day_tour', 'tour'] as const;

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
}: {
  label: string;
  aiLabel: string;
  fromAi: boolean;
  quote: string | null;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <AiTag show={fromAi} label={aiLabel} />
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
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
}: {
  label: string;
  aiLabel: string;
  fromAi: boolean;
  options: readonly string[];
  value: string | null;
  onPick: (v: string) => void;
  labelFor: (v: string) => string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
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

  const active = services[activeIndex] ?? null;
  const draft = active?.draft ?? null;
  const sources = active?.sources ?? {};
  const evidence = active?.evidence ?? null;
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

  function patch(changes: Partial<ImportedBookingDraft>) {
    setServices((prev) =>
      prev.map((s, i) => (i === activeIndex ? { ...s, draft: { ...s.draft, ...changes } } : s)),
    );
  }

  function showResult(res: BookingImportResult | BookingImportFailure, source: ReadSource) {
    if (!res.ok) {
      notify(t('importBooking.readFailed'), res.error);
      return;
    }
    setServices(
      res.services ?? [{ draft: res.draft, sources: res.sources ?? {}, warnings: res.warnings ?? [] }],
    );
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

  function serviceLabel(service: ImportedService, index: number): string {
    const d = service.draft;
    const date = d.date_display ? formatImportedDate(d.date_display) : '';
    const route =
      [d.from_location, d.to_location].filter(Boolean).join(' → ') || d.route || '';
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

    for (const i of pendingIndexes) {
      const missing = missingRequiredFields(services[i].draft);
      if (missing.length > 0) {
        setActiveIndex(i);
        notify(
          t('importBooking.missingTitle'),
          services.length > 1
            ? `${serviceLabel(services[i], i)}\n\n${missing.join('\n')}`
            : missing.join('\n'),
        );
        return;
      }
    }

    setSubmitting(true);
    const done: number[] = [];
    let failure: string | null = null;

    for (const i of pendingIndexes) {
      const d = services[i].draft;
      const base = draftToInsertInput(d, {
        companyUserId: user.id,
        companyName: companyDisplayName(profile, user),
        createdByName: profile?.full_name ?? null,
      });

      const payload = {
        ...base,
        price_gel: d.client_price ?? 0,
        commission: null,
        itinerary: null,
        transfer_in: null,
        transfer_out: null,
      } as InsertBookingInput;

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

  return (
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
                onChangeText={setText}
                placeholder={t('importBooking.textPlaceholder')}
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
                autoCorrect={false}
                maxLength={MAX_TEXT_CHARS}
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
              value={draft.kind}
              onPick={(v) => patch({ kind: v as ImportedBookingDraft['kind'] })}
              labelFor={(v) => t(`importBooking.kinds.${v}`)}
            />

            <View style={styles.field}>
              <DateTimeField
                key={`date-${activeIndex}`}
                label={t('importBooking.date')}
                value={parseStoredDateTime(draft.date_display)}
                onChange={(d) =>
                  patch(
                    d
                      ? { date_display: d.toISOString(), pickup_time: hhmm(d) }
                      : { date_display: null, pickup_time: null },
                  )
                }
                placeholder={t('importBooking.datePlaceholder')}
              />
              {fromAi('date_display') || quote('date_display') ? (
                <View style={styles.dateMeta}>
                  <AiTag show={fromAi('date_display')} label={aiLabel} />
                  <Quote text={quote('date_display')} />
                </View>
              ) : null}
            </View>

            <ReviewField
              label={t('importBooking.from')}
              aiLabel={aiLabel}
              fromAi={fromAi('from_location')}
              quote={quote('from_location')}
              value={draft.from_location ?? ''}
              onChange={(v) => patch({ from_location: v || null })}
            />
            <ReviewField
              label={t('importBooking.to')}
              aiLabel={aiLabel}
              fromAi={fromAi('to_location')}
              quote={quote('to_location')}
              value={draft.to_location ?? ''}
              onChange={(v) => patch({ to_location: v || null })}
            />
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
            />

            <ReviewChips
              label={t('importBooking.vehicleType')}
              aiLabel={aiLabel}
              fromAi={fromAi('vehicle_type')}
              options={VEHICLE_TYPES}
              value={draft.vehicle_type}
              onPick={(v) => patch({ vehicle_type: v })}
              labelFor={(v) => t(`importBooking.vehicleTypes.${v}`)}
            />
            <ReviewChips
              label={t('importBooking.vehicleClass')}
              aiLabel={aiLabel}
              fromAi={fromAi('vehicle_class')}
              options={VEHICLE_CLASSES}
              value={draft.vehicle_class}
              onPick={(v) => patch({ vehicle_class: v })}
              labelFor={(v) => t(`importBooking.vehicleClasses.${v}`)}
            />

            <ReviewField
              label={t('importBooking.flight')}
              aiLabel={aiLabel}
              fromAi={fromAi('flight_number')}
              quote={quote('flight_number')}
              value={draft.flight_number ?? ''}
              onChange={(v) => patch({ flight_number: v || null })}
            />
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
            <ReviewField
              label={t('importBooking.price')}
              aiLabel={aiLabel}
              fromAi={fromAi('client_price')}
              quote={quote('client_price')}
              value={draft.client_price != null ? String(draft.client_price) : ''}
              onChange={(v) => {
                const n = Number(v.replace(/\s/g, '').replace(',', '.'));
                patch({ client_price: v.trim() && Number.isFinite(n) && n >= 0 ? n : null });
              }}
              keyboardType="decimal-pad"
            />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('importBooking.meetGreet')}</Text>
              <Switch
                value={draft.meet_greet === true}
                onValueChange={(v) => patch({ meet_greet: v })}
                trackColor={{ true: COLORS.goldLight, false: COLORS.border }}
                thumbColor={draft.meet_greet ? COLORS.gold : COLORS.white}
              />
            </View>

            <ReviewField
              label={t('importBooking.hotel')}
              aiLabel={aiLabel}
              fromAi={fromAi('hotel')}
              quote={quote('hotel')}
              value={draft.hotel ?? ''}
              onChange={(v) => patch({ hotel: v || null })}
            />
            <ReviewField
              label={t('importBooking.sign')}
              aiLabel={aiLabel}
              fromAi={fromAi('sign_text')}
              quote={quote('sign_text')}
              value={draft.sign_text ?? ''}
              onChange={(v) => patch({ sign_text: v || null })}
            />
            <ReviewField
              label={t('importBooking.comment')}
              aiLabel={aiLabel}
              fromAi={fromAi('comment')}
              quote={quote('comment')}
              value={draft.comment ?? ''}
              onChange={(v) => patch({ comment: v || null })}
            />
          </View>

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
  );
}

const styles = StyleSheet.create({
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
});
