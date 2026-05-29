import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import { confirmDriverPaymentReceived, isBookingPaymentPaid } from '../lib/bookingPayments';
import { mapSupabaseError, showErrorAlert } from '../lib/validation';
import { BookingPaymentBadge } from './BookingPaymentBadge';

type Props = {
  booking: BookingRow;
  driverUserId: string;
  onUpdated?: () => void;
  actingId?: string | null;
  setActingId?: (id: string | null) => void;
};

export function BookingPaymentConfirm({
  booking,
  driverUserId,
  onUpdated,
  actingId: externalActingId,
  setActingId: setExternalActingId,
}: Props) {
  const { t } = useTranslation();
  const [localActing, setLocalActing] = useState(false);
  const acting = externalActingId === booking.id || localActing;
  const paid = isBookingPaymentPaid(booking);

  const setActing = useCallback(
    (busy: boolean) => {
      if (setExternalActingId) setExternalActingId(busy ? booking.id : null);
      else setLocalActing(busy);
    },
    [booking.id, setExternalActingId],
  );

  const onConfirm = useCallback(async () => {
    setActing(true);
    const res = await confirmDriverPaymentReceived(booking.id, driverUserId);
    setActing(false);
    if (!res.ok) {
      showErrorAlert(mapSupabaseError(res.error));
      return;
    }
    onUpdated?.();
  }, [booking.id, driverUserId, onUpdated, setActing]);

  if (booking.status !== 'completed') return null;

  return (
    <View style={styles.wrap}>
      <BookingPaymentBadge paymentStatus={booking.payment_status} bookingStatus={booking.status} />
      {paid ? (
        <Text style={styles.paidLabel}>{t('bookingPayment.paidConfirmed')}</Text>
      ) : (
        <Pressable
          disabled={acting}
          onPress={() => void onConfirm()}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, acting && styles.btnDisabled]}
        >
          {acting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.btnText}>{t('bookingPayment.confirmReceived')}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },
  paidLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
  },
  btn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    minWidth: 200,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.88,
  },
  btnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
});
