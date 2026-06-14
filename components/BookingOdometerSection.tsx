import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import { isTourBookingKind } from '../lib/bookings';
import { formatDisplayDateTime, parseStoredDateTime } from '../lib/dateTime';
import { withCacheBust } from '../lib/mediaUpload';

type Props = {
  booking: BookingRow;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

function formatOdometerTime(iso: string | null | undefined): string | null {
  const d = parseStoredDateTime(iso);
  return d ? formatDisplayDateTime(d) : null;
}

function OdometerSlot({
  label,
  photoUrl,
  timeLabel,
  onPress,
  compact,
}: {
  label: string;
  photoUrl: string | null | undefined;
  timeLabel: string | null;
  onPress: () => void;
  compact?: boolean;
}) {
  const uri = photoUrl ? withCacheBust(photoUrl) ?? photoUrl : null;

  return (
    <Pressable
      onPress={uri ? onPress : undefined}
      disabled={!uri}
      style={({ pressed }) => [
        styles.slot,
        compact && styles.slotCompact,
        uri && pressed && styles.pressed,
        !uri && styles.slotEmpty,
      ]}
    >
      <Text style={styles.slotLabel}>{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={[styles.thumb, compact && styles.thumbCompact]} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, compact && styles.thumbCompact, styles.thumbPlaceholder]}>
          <Ionicons name="speedometer-outline" size={compact ? 18 : 22} color={COLORS.textMuted} />
        </View>
      )}
      {timeLabel ? <Text style={styles.slotTime}>{timeLabel}</Text> : null}
    </Pressable>
  );
}

export type OdometerDisplayStatus = 'waiting' | 'partial' | 'complete';

/** Tours with an assigned driver — company sees odometer block from accept through completion. */
export function shouldShowBookingOdometer(booking: BookingRow): boolean {
  if (!isTourBookingKind(booking.kind)) return false;
  const hasDriver = !!booking.driver_id?.trim();
  if (
    hasDriver &&
    (booking.status === 'accepted' ||
      booking.status === 'in_progress' ||
      booking.status === 'completed')
  ) {
    return true;
  }
  return !!(booking.odometer_start_photo_url || booking.odometer_end_photo_url);
}

export function bookingOdometerDisplayStatus(booking: BookingRow): OdometerDisplayStatus | null {
  if (!shouldShowBookingOdometer(booking)) return null;
  const hasStart = !!booking.odometer_start_photo_url?.trim();
  const hasEnd = !!booking.odometer_end_photo_url?.trim();
  if (hasStart && hasEnd) return 'complete';
  if (hasStart) return 'partial';
  return 'waiting';
}

export function BookingOdometerBadge({ booking }: { booking: BookingRow }) {
  const { t } = useTranslation();
  const status = bookingOdometerDisplayStatus(booking);
  if (!status) return null;

  const cfg =
    status === 'complete'
      ? { bg: '#DCFCE7', color: '#15803D', label: t('bookingOdometer.badgeComplete') }
      : status === 'partial'
        ? { bg: '#FEF3C7', color: '#B45309', label: t('bookingOdometer.badgeStartDone') }
        : { bg: '#F3F4F6', color: '#6B7280', label: t('bookingOdometer.badgeWaiting') };

  return (
    <View style={[badgeStyles.pill, { backgroundColor: cfg.bg }]}>
      <Ionicons name="speedometer-outline" size={12} color={cfg.color} />
      <Text style={[badgeStyles.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export function BookingOdometerSection({ booking, style, compact }: Props) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  if (!shouldShowBookingOdometer(booking)) return null;

  const startTime = formatOdometerTime(booking.odometer_start_at);
  const endTime = formatOdometerTime(booking.odometer_end_at);

  function openPreview(url: string | null | undefined, title: string) {
    if (!url?.trim()) return;
    setPreviewUrl(withCacheBust(url) ?? url);
    setPreviewTitle(title);
  }

  return (
    <>
      <View style={[styles.wrap, style]}>
        <Text style={styles.title}>{t('bookingOdometer.sectionTitle')}</Text>
        <View style={styles.row}>
          <OdometerSlot
            label={t('bookingOdometer.start')}
            photoUrl={booking.odometer_start_photo_url}
            timeLabel={startTime}
            compact={compact}
            onPress={() => openPreview(booking.odometer_start_photo_url, t('bookingOdometer.start'))}
          />
          <OdometerSlot
            label={t('bookingOdometer.end')}
            photoUrl={booking.odometer_end_photo_url}
            timeLabel={endTime}
            compact={compact}
            onPress={() => openPreview(booking.odometer_end_photo_url, t('bookingOdometer.end'))}
          />
        </View>
        {!booking.odometer_start_photo_url && booking.status === 'accepted' ? (
          <Text style={styles.hint}>{t('bookingOdometer.waitingStart')}</Text>
        ) : null}
        {booking.odometer_start_photo_url && !booking.odometer_end_photo_url && booking.status === 'in_progress' ? (
          <Text style={styles.hint}>{t('bookingOdometer.waitingEnd')}</Text>
        ) : null}
      </View>

      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewUrl(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{previewTitle}</Text>
            {previewUrl ? (
              <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
            <Pressable onPress={() => setPreviewUrl(null)} style={styles.previewClose}>
              <Text style={styles.previewCloseText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  slot: {
    flex: 1,
    gap: 4,
  },
  slotCompact: {
    maxWidth: 120,
  },
  slotEmpty: {
    opacity: 0.85,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  thumb: {
    width: '100%',
    height: 72,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  thumbCompact: {
    height: 56,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  slotTime: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  pressed: {
    opacity: 0.88,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    maxHeight: '90%',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: 360,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt,
  },
  previewClose: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gold,
  },
  previewCloseText: {
    fontWeight: '800',
    color: '#000',
  },
});
