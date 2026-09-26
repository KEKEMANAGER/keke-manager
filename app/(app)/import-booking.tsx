import type { User } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth, type Profile } from '../../contexts/AuthContext';
import { insertBooking, type InsertBookingInput } from '../../lib/bookings';
import {
  draftToInsertInput,
  importBookingFromFile,
  missingRequiredFields,
  type ImportedBookingDraft,
  type ImportFieldSource,
} from '../../lib/bookingImport';

/**
 * Import a booking from the operator's own Word / Excel file.
 *
 * The parse result is a DRAFT and nothing more: it is shown here for the
 * company to check and correct, and the booking is only created through the
 * ordinary `insertBooking` path — so the review gate, the driver-availability
 * check and every other rule still apply exactly as if it had been typed.
 */

function companyDisplayName(profile: Profile | null, user: User | null): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const cn = meta?.companyName;
  if (typeof cn === 'string' && cn.trim()) return cn.trim();
  const fn = profile?.full_name?.trim();
  if (fn) return fn;
  return user?.email ?? null;
}

const VEHICLE_TYPES = ['sedan', 'minivan', 'microbus', 'bus', 'suv'] as const;
const VEHICLE_CLASSES = ['economy', 'comfort', 'vip'] as const;
const KINDS = ['transfer', 'day_tour', 'tour'] as const;

export default function ImportBookingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<ImportedBookingDraft | null>(null);
  const [sources, setSources] = useState<Partial<Record<keyof ImportedBookingDraft, ImportFieldSource>>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [fileName, setFileName] = useState('');

  function patch<K extends keyof ImportedBookingDraft>(key: K, value: ImportedBookingDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onPickFile() {
    if (busy) return;
    setBusy(true);
    const res = await importBookingFromFile();
    setBusy(false);

    if (res === null) return; // cancelled
    if (!res.ok) {
      Alert.alert(t('importBooking.readFailed'), res.error);
      return;
    }

    setDraft(res.draft);
    setSources(res.sources ?? {});
    setWarnings(res.warnings ?? []);
    setUsedAi(res.usedAi);
    setFileName(res.fileName);
  }

  async function onCreate() {
    if (!draft || !user?.id || submitting) return;

    const missing = missingRequiredFields(draft);
    if (missing.length > 0) {
      Alert.alert(t('importBooking.missingTitle'), missing.join('\n'));
      return;
    }

    setSubmitting(true);
    const base = draftToInsertInput(draft, {
      companyUserId: user.id,
      companyName: companyDisplayName(profile, user),
      createdByName: profile?.full_name ?? null,
    });

    const payload = {
      ...base,
      price_gel: draft.client_price ?? 0,
      commission: null,
      itinerary: null,
      transfer_in: null,
      transfer_out: null,
    } as InsertBookingInput;

    const { id, error } = await insertBooking(payload);
    setSubmitting(false);

    if (error || !id) {
      Alert.alert(t('common.error'), error?.message ?? t('importBooking.createFailed'));
      return;
    }

    Alert.alert(t('common.success'), t('importBooking.created'), [
      { text: t('common.ok'), onPress: () => router.replace('/(app)/dashboard') },
    ]);
  }

  function SourceTag({ field }: { field: keyof ImportedBookingDraft }) {
    const s = sources[field];
    if (s !== 'ai') return null;
    return (
      <View style={styles.aiTag}>
        <Text style={styles.aiTagText}>{t('importBooking.aiGuessed')}</Text>
      </View>
    );
  }

  function Field({
    label,
    field,
    value,
    onChange,
    keyboardType,
    placeholder,
  }: {
    label: string;
    field: keyof ImportedBookingDraft;
    value: string;
    onChange: (v: string) => void;
    keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
    placeholder?: string;
  }) {
    return (
      <View style={styles.field}>
        <View style={styles.fieldHead}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <SourceTag field={field} />
        </View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType ?? 'default'}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
        />
      </View>
    );
  }

  function ChipRow({
    label,
    field,
    options,
    value,
    onPick,
    labelFor,
  }: {
    label: string;
    field: keyof ImportedBookingDraft;
    options: readonly string[];
    value: string | null;
    onPick: (v: string) => void;
    labelFor: (v: string) => string;
  }) {
    return (
      <View style={styles.field}>
        <View style={styles.fieldHead}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <SourceTag field={field} />
        </View>
        <View style={styles.chips}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <Pressable
                key={opt}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => onPick(opt)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                  {labelFor(opt)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl * 2 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('importBooking.title')}</Text>
        <Text style={styles.subtitle}>{t('importBooking.subtitle')}</Text>
      </View>

      <Pressable
        style={[styles.pickBtn, busy ? styles.btnDisabled : null]}
        disabled={busy}
        onPress={() => void onPickFile()}
      >
        {busy ? (
          <ActivityIndicator color={COLORS.goldDark} />
        ) : (
          <Text style={styles.pickBtnText}>
            {draft ? t('importBooking.pickAnother') : t('importBooking.pick')}
          </Text>
        )}
      </Pressable>

      {!draft ? (
        <Text style={styles.hint}>{t('importBooking.formatsHint')}</Text>
      ) : (
        <>
          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
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
          </View>

          {warnings.length > 0 ? (
            <View style={styles.warnBox}>
              {warnings.map((w) => (
                <Text key={w} style={styles.warnText}>
                  • {w}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <ChipRow
              label={t('importBooking.kind')}
              field="kind"
              options={KINDS}
              value={draft.kind}
              onPick={(v) => patch('kind', v as ImportedBookingDraft['kind'])}
              labelFor={(v) => t(`importBooking.kinds.${v}`)}
            />

            <Field
              label={t('importBooking.date')}
              field="date_display"
              value={draft.date_display ?? ''}
              onChange={(v) => patch('date_display', v.trim() || null)}
              placeholder="2026-05-15T09:30:00.000Z"
            />
            <Field
              label={t('importBooking.from')}
              field="from_location"
              value={draft.from_location ?? ''}
              onChange={(v) => patch('from_location', v || null)}
            />
            <Field
              label={t('importBooking.to')}
              field="to_location"
              value={draft.to_location ?? ''}
              onChange={(v) => patch('to_location', v || null)}
            />
            <Field
              label={t('importBooking.passengers')}
              field="passengers"
              value={draft.passengers != null ? String(draft.passengers) : ''}
              onChange={(v) => {
                const n = Number(v.replace(/\D/g, ''));
                patch('passengers', Number.isFinite(n) && n > 0 ? n : null);
              }}
              keyboardType="decimal-pad"
            />

            <ChipRow
              label={t('importBooking.vehicleType')}
              field="vehicle_type"
              options={VEHICLE_TYPES}
              value={draft.vehicle_type}
              onPick={(v) => patch('vehicle_type', v)}
              labelFor={(v) => t(`importBooking.vehicleTypes.${v}`)}
            />
            <ChipRow
              label={t('importBooking.vehicleClass')}
              field="vehicle_class"
              options={VEHICLE_CLASSES}
              value={draft.vehicle_class}
              onPick={(v) => patch('vehicle_class', v)}
              labelFor={(v) => t(`importBooking.vehicleClasses.${v}`)}
            />

            <Field
              label={t('importBooking.flight')}
              field="flight_number"
              value={draft.flight_number ?? ''}
              onChange={(v) => patch('flight_number', v || null)}
            />
            <Field
              label={t('importBooking.passengerName')}
              field="passenger_name"
              value={draft.passenger_name ?? ''}
              onChange={(v) => patch('passenger_name', v || null)}
            />
            <Field
              label={t('importBooking.phone')}
              field="passenger_phone"
              value={draft.passenger_phone ?? ''}
              onChange={(v) => patch('passenger_phone', v || null)}
              keyboardType="phone-pad"
            />
            <Field
              label={t('importBooking.price')}
              field="client_price"
              value={draft.client_price != null ? String(draft.client_price) : ''}
              onChange={(v) => {
                const n = Number(v.replace(/\s/g, '').replace(',', '.'));
                patch('client_price', Number.isFinite(n) && n >= 0 ? n : null);
              }}
              keyboardType="decimal-pad"
            />

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('importBooking.meetGreet')}</Text>
              <Switch
                value={draft.meet_greet === true}
                onValueChange={(v) => patch('meet_greet', v)}
                trackColor={{ true: COLORS.goldLight, false: COLORS.border }}
                thumbColor={draft.meet_greet ? COLORS.gold : COLORS.white}
              />
            </View>

            <Field
              label={t('importBooking.sign')}
              field="sign_text"
              value={draft.sign_text ?? ''}
              onChange={(v) => patch('sign_text', v || null)}
            />
            <Field
              label={t('importBooking.comment')}
              field="comment"
              value={draft.comment ?? ''}
              onChange={(v) => patch('comment', v || null)}
            />
          </View>

          <Pressable
            style={[styles.createBtn, submitting ? styles.btnDisabled : null]}
            disabled={submitting}
            onPress={() => void onCreate()}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.createBtnText}>{t('importBooking.create')}</Text>
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
