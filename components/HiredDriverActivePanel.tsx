import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow } from '../lib/bookings';
import {
  bookingStatusLabel,
  completeBooking,
  formatBookingDate,
  isTourBookingKind,
  routeSummary,
  startBookingTrip,
} from '../lib/bookings';
import { formatTourBookingNotificationBody } from '../lib/tourDays';
import {
  completeTourTripWithOdometer,
  odometerErrorMessageKey,
  startTourTripWithOdometer,
} from '../lib/tourTripLifecycle';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { navigateToTripGps } from '../lib/tripGpsNavigation';
import { shareVoucherPDF } from '../lib/voucher';
import { mapSupabaseError, showErrorAlert } from '../lib/validation';
import { BookingPaymentConfirm } from './BookingPaymentConfirm';
import { BookingPriceDisplay } from './BookingPriceDisplay';
import { BookingChatThreads } from './BookingChatThreads';

type Props = {
  booking: BookingRow | null;
  driverUserId: string;
  onTripUpdated?: () => void;
};

export function HiredDriverActivePanel({ booking, driverUserId, onTripUpdated }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const runTripAction = useCallback(
    async (action: 'start' | 'complete') => {
      if (!booking?.id) return;
      setBusy(true);
      const res =
        action === 'start'
          ? isTourBookingKind(booking.kind)
            ? await startTourTripWithOdometer(booking, driverUserId)
            : await startBookingTrip(booking.id, driverUserId).then((r) =>
                r.ok
                  ? { ok: true as const }
                  : { ok: false as const, error: r.error ?? new Error('start_failed') },
              )
          : isTourBookingKind(booking.kind)
            ? await completeTourTripWithOdometer(booking, driverUserId)
            : await completeBooking(booking.id, driverUserId).then((r) =>
                r.ok
                  ? { ok: true as const }
                  : { ok: false as const, error: r.error ?? new Error('complete_failed') },
              );
      setBusy(false);
      if (!res.ok) {
        if ('cancelled' in res && res.cancelled) return;
        const err = 'error' in res ? res.error : null;
        showErrorAlert(
          mapSupabaseError(err) || t(odometerErrorMessageKey(err)),
        );
        return;
      }
      onTripUpdated?.();
      if (action === 'start') {
        navigateToTripGps(router, booking.id);
      }
    },
    [booking, driverUserId, onTripUpdated, router],
  );

  if (!booking) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>{t('hiredDriver.noAssignedBooking')}</Text>
      </View>
    );
  }

  const voucherCode = booking.voucher_code?.trim() || `KEKE-${booking.id.slice(0, 6).toUpperCase()}`;
  const tourDetail =
    booking.kind === 'tour'
      ? formatTourBookingNotificationBody({
          tour_days: booking.tour_days,
          transfer_in: booking.transfer_in,
          transfer_out: booking.transfer_out,
        })
      : null;

  const canStart = booking.status === 'accepted';
  const canComplete = booking.status === 'in_progress';
  const isCompleted = booking.status === 'completed';

  return (
    <View style={[styles.card, SHADOWS.card]}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{t('hiredDriver.voucherTitle')}</Text>
        <Text style={styles.status}>{bookingStatusLabel(booking.status)}</Text>
      </View>
      <Text style={styles.voucherCode}>{voucherCode}</Text>
      <Text style={styles.company}>{booking.company_name || t('common.company')}</Text>
      <Text style={styles.route}>{routeSummary(booking)}</Text>
      <Text style={styles.meta}>{formatBookingDate(booking)}</Text>
      {tourDetail ? <Text style={styles.tourDetail}>{tourDetail}</Text> : null}
      <View style={styles.priceWrap}>
        <BookingPriceDisplay booking={booking} viewerUserId={driverUserId} size="lg" />
      </View>

      <View style={styles.actions}>
        {canStart ? (
          <Pressable
            disabled={busy}
            onPress={() => void runTripAction('start')}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('hiredDriver.startTour')}</Text>
            )}
          </Pressable>
        ) : null}
        {canComplete ? (
          <Pressable
            disabled={busy}
            onPress={() => void runTripAction('complete')}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>{t('hiredDriver.endTour')}</Text>
          </Pressable>
        ) : null}
        {isCompleted ? (
          <BookingPaymentConfirm
            booking={booking}
            driverUserId={driverUserId}
            onUpdated={onTripUpdated}
          />
        ) : null}
        <Pressable
          onPress={() => void shareVoucherPDF(booking)}
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
        >
          <Text style={styles.outlineBtnText}>📄 {t('common.voucher')}</Text>
        </Pressable>
        {Platform.OS !== 'web' ? (
          <Pressable
            onPress={() => router.push('/(driver)/gps')}
            style={({ pressed }) => [styles.gpsBtn, pressed && styles.pressed]}
          >
            <Ionicons name="navigate" size={18} color={COLORS.gold} />
            <Text style={styles.gpsBtnText}>{t('hiredDriver.enableGps')}</Text>
          </Pressable>
        ) : null}
      </View>

      <BookingChatThreads
        bookingId={booking.id}
        viewerUserId={driverUserId}
        chatStack="driver"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  emptyCard: {
    alignItems: 'center',
    padding: SPACING.xl,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  badge: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  status: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  voucherCode: {
    color: COLORS.gold,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: SPACING.sm,
  },
  company: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  route: {
    color: COLORS.text,
    fontSize: 15,
    marginTop: 6,
    lineHeight: 22,
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  tourDetail: {
    color: COLORS.grayLight,
    fontSize: 13,
    lineHeight: 20,
    marginTop: SPACING.sm,
  },
  priceWrap: {
    marginTop: SPACING.md,
    alignItems: 'flex-end',
  },
  actions: {
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: COLORS.goldTint,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  secondaryBtnText: {
    color: COLORS.goldDark,
    fontWeight: '800',
    fontSize: 15,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: COLORS.text,
    fontWeight: '700',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  gpsBtnText: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
  },
});
