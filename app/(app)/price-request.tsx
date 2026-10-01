import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { formatDisplayDateTime, parseStoredDateTime } from '../../lib/dateTime';
import {
  fetchMyPriceRequests,
  priceRequestRouteSummary,
  submitPriceRequest,
  subscribeMyPriceRequests,
  type PriceRequestKind,
  type PriceRequestRow,
} from '../../lib/priceRequests';
import { VEHICLE_TYPES, vehicleTypeLabel } from '../../lib/vehicleCatalog';

/**
 * Ask what a job would cost, before there is a booking.
 *
 * No formula runs here. Georgian tour transport is priced per operator, per
 * season and per relationship, so the request goes to a person who answers from
 * Telegram, usually within minutes, and the answer arrives back on this screen.
 */

const KINDS: PriceRequestKind[] = ['transfer', 'day_tour', 'tour'];

function askedAt(iso: string): string {
  const d = parseStoredDateTime(iso);
  return d ? formatDisplayDateTime(d) : '—';
}

function formatGel(n: number): string {
  return `${Number(n).toLocaleString('ka-GE')} ₾`;
}

export default function PriceRequestScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [kind, setKind] = useState<PriceRequestKind>('transfer');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [whenText, setWhenText] = useState('');
  const [days, setDays] = useState('');
  const [passengers, setPassengers] = useState('');
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState<PriceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchMyPriceRequests(userId);
    setRows(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = subscribeMyPriceRequests(userId, () => void load());
    return () => {
      void ch.unsubscribe();
    };
  }, [userId, load]);

  function reset() {
    setFrom('');
    setTo('');
    setWhenText('');
    setDays('');
    setPassengers('');
    setVehicleType(null);
    setNote('');
  }

  async function onSend() {
    if (sending) return;
    if (!from.trim() && !note.trim()) {
      Alert.alert(t('common.error'), t('priceRequest.needRoute'));
      return;
    }

    setSending(true);
    const res = await submitPriceRequest({
      kind,
      from_location: from.trim() || null,
      to_location: to.trim() || null,
      when_text: whenText.trim() || null,
      days: kind === 'tour' ? Number(days) || null : null,
      passengers: Number(passengers) || null,
      vehicle_type: vehicleType,
      note: note.trim() || null,
    });
    setSending(false);

    if (!res.ok) {
      Alert.alert(t('common.error'), res.error);
      return;
    }
    reset();
    void load();
    Alert.alert(t('priceRequest.sentTitle'), t('priceRequest.sentBody'));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl * 2 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('priceRequest.title')}</Text>
      <Text style={styles.subtitle}>{t('priceRequest.subtitle')}</Text>

      <View style={[styles.card, SHADOWS.card]}>
        <Text style={styles.label}>{t('priceRequest.kind')}</Text>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.chip, kind === k && styles.chipActive]}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>
                {t(`priceRequest.kinds.${k}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('priceRequest.from')}</Text>
        <TextInput
          style={styles.input}
          value={from}
          onChangeText={setFrom}
          placeholder={t('priceRequest.fromPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
        />

        <Text style={styles.label}>{t('priceRequest.to')}</Text>
        <TextInput
          style={styles.input}
          value={to}
          onChangeText={setTo}
          placeholder={t('priceRequest.toPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
        />

        <Text style={styles.label}>{t('priceRequest.when')}</Text>
        <TextInput
          style={styles.input}
          value={whenText}
          onChangeText={setWhenText}
          placeholder={t('priceRequest.whenPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
        />

        <View style={styles.row}>
          {kind === 'tour' ? (
            <View style={styles.half}>
              <Text style={styles.label}>{t('priceRequest.days')}</Text>
              <TextInput
                style={styles.input}
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          ) : null}
          <View style={styles.half}>
            <Text style={styles.label}>{t('priceRequest.passengers')}</Text>
            <TextInput
              style={styles.input}
              value={passengers}
              onChangeText={setPassengers}
              keyboardType="number-pad"
              placeholder="4"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </View>

        <Text style={styles.label}>{t('priceRequest.vehicle')}</Text>
        <View style={styles.chips}>
          {VEHICLE_TYPES.map((v) => (
            <Pressable
              key={v}
              onPress={() => setVehicleType(vehicleType === v ? null : v)}
              style={[styles.chip, vehicleType === v && styles.chipActive]}
            >
              <Text style={[styles.chipText, vehicleType === v && styles.chipTextActive]}>
                {vehicleTypeLabel(v)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('priceRequest.note')}</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={t('priceRequest.notePlaceholder')}
          placeholderTextColor={COLORS.textMuted}
        />

        <Pressable
          onPress={() => void onSend()}
          disabled={sending}
          style={({ pressed }) => [styles.sendBtn, (sending || pressed) && styles.sendBtnDim]}
        >
          {sending ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.sendBtnText}>{t('priceRequest.send')}</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>{t('priceRequest.hint')}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('priceRequest.myRequests')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={styles.loading} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('priceRequest.none')}</Text>
      ) : (
        rows.map((r) => {
          const quoted = r.status === 'quoted' && r.quoted_price_gel != null;
          return (
            <View key={r.id} style={[styles.reqCard, quoted && styles.reqCardQuoted]}>
              <View style={styles.reqTop}>
                <Text style={styles.reqKind}>
                  #{r.id} · {t(`priceRequest.kinds.${r.kind}`, { defaultValue: r.kind })}
                </Text>
                {quoted ? (
                  <Text style={styles.reqPrice}>{formatGel(Number(r.quoted_price_gel))}</Text>
                ) : (
                  <Text style={styles.reqWaiting}>{t('priceRequest.waiting')}</Text>
                )}
              </View>
              <Text style={styles.reqRoute}>{priceRequestRouteSummary(r)}</Text>
              {r.when_text ? <Text style={styles.reqMeta}>{r.when_text}</Text> : null}
              {quoted && r.quoted_note ? (
                <Text style={styles.reqNote}>{r.quoted_note}</Text>
              ) : null}
              <Text style={styles.reqAsked}>
                {t('priceRequest.asked')}: {askedAt(r.created_at)}
              </Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, gap: SPACING.sm },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 20 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldLight },
  chipText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.black, fontWeight: '800' },
  sendBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendBtnDim: { opacity: 0.75 },
  sendBtnText: { color: COLORS.black, fontWeight: '800', fontSize: 16 },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.xl,
  },
  loading: { marginTop: SPACING.lg },
  empty: { color: COLORS.textMuted, fontSize: 14, marginTop: SPACING.xs },
  reqCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 3,
  },
  reqCardQuoted: { borderColor: COLORS.gold },
  reqTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: SPACING.sm,
  },
  reqKind: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, flexShrink: 1 },
  reqPrice: { fontSize: 18, fontWeight: '800', color: COLORS.gold },
  reqWaiting: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  reqRoute: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  reqMeta: { fontSize: 13, color: COLORS.textSecondary },
  reqNote: { fontSize: 13, color: COLORS.text, fontStyle: 'italic' },
  reqAsked: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
