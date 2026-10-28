import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';
import {
  fetchTripEvents,
  formatEventTime,
  subscribeToTripEvents,
  tripEventMapUrl,
  type TripEventRow,
} from '../lib/tripEvents';

type Props = {
  bookingId: string;
  /** One line with the latest mark, for a booking card in a list. */
  compact?: boolean;
  /** Show only the latest this many (a card over a map has little room). */
  limit?: number;
};

function dayLabel(iso: string, months: string[]): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return '';
  return `${d.getDate()} ${months[d.getMonth()] ?? ''}`.trim();
}

/**
 * The driver's "passengers picked up / dropped off" marks for one booking:
 * when, and where the car was. Updates the moment he marks one.
 */
export function TripEventsSection({ bookingId, compact, limit }: Props) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<TripEventRow[]>([]);

  useEffect(() => {
    const id = bookingId?.trim();
    if (!id) return undefined;
    let cancelled = false;
    const load = () =>
      void fetchTripEvents(id).then((rows) => {
        if (!cancelled) setEvents(rows);
      });
    load();
    const ch = subscribeToTripEvents(id, load);
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [bookingId]);

  if (events.length === 0) return null;
  const months = t('calendarScreen.months').split(',');

  const line = (ev: TripEventRow) => {
    const day = dayLabel(ev.happened_at, months);
    const what = ev.kind === 'pickup' ? t('tripEvents.pickedUp') : t('tripEvents.droppedOff');
    return [what, `${day ? `${day}, ` : ''}${formatEventTime(ev.happened_at)}`, ev.place_label?.trim() || null]
      .filter(Boolean)
      .join(' · ');
  };

  if (compact) {
    const last = events[events.length - 1]!;
    return (
      <View style={styles.compact}>
        <Ionicons
          name={last.kind === 'pickup' ? 'people' : 'flag'}
          size={14}
          color={last.kind === 'pickup' ? COLORS.goldDark : COLORS.success}
        />
        <Text style={styles.compactText} numberOfLines={1}>
          {line(last)}
        </Text>
      </View>
    );
  }

  const shown = limit && limit > 0 ? events.slice(-limit) : events;

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('tripEvents.title')}</Text>
      {shown.map((ev) => (
        <View key={ev.id} style={styles.row}>
          <View style={[styles.dot, ev.kind === 'pickup' ? styles.dotPickup : styles.dotDropoff]}>
            <Ionicons name={ev.kind === 'pickup' ? 'people' : 'flag'} size={12} color={COLORS.white} />
          </View>
          <Text style={styles.rowText}>{line(ev)}</Text>
          {ev.latitude != null && ev.longitude != null ? (
            <Pressable
              onPress={() => void Linking.openURL(tripEventMapUrl(ev.latitude!, ev.longitude!))}
              hitSlop={8}
              style={({ pressed }) => [styles.mapBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="location-outline" size={14} color={COLORS.goldDark} />
              <Text style={styles.mapBtnText}>{t('tripEvents.onMap')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dotPickup: { backgroundColor: COLORS.gold },
  dotDropoff: { backgroundColor: COLORS.success },
  rowText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.goldTint,
  },
  mapBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.goldDark },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  compactText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: COLORS.textSecondary },
});
