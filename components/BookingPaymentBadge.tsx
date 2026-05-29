import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS } from '../constants/theme';
import { isBookingPaymentPaid, type BookingPaymentStatus } from '../lib/bookingPayments';

type Props = {
  paymentStatus: BookingPaymentStatus | string | null | undefined;
  bookingStatus?: string | null;
};

export function BookingPaymentBadge({ paymentStatus, bookingStatus }: Props) {
  const { t } = useTranslation();
  const completed = bookingStatus === 'completed';
  if (!completed) return null;

  const paid = isBookingPaymentPaid({ payment_status: paymentStatus ?? 'unpaid' });

  return (
    <View style={[styles.badge, paid ? styles.badgePaid : styles.badgeUnpaid]}>
      <Text style={[styles.text, paid ? styles.textPaid : styles.textUnpaid]}>
        {paid ? t('bookingPayment.paidBadge') : t('bookingPayment.unpaidBadge')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  badgePaid: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderColor: COLORS.success,
  },
  badgeUnpaid: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    borderColor: COLORS.error,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  textPaid: {
    color: COLORS.success,
  },
  textUnpaid: {
    color: COLORS.error,
  },
});
