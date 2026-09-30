import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow } from '../lib/bookings';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type Props = {
  booking: Pick<BookingRow, 'status' | 'driver_id' | 'driver_confirmed_1h'>;
};

/**
 * Company-side answer to "has the driver actually promised to show up?".
 *
 * Accepting a booking and confirming it are two different promises, and until
 * now only the driver could see the difference: the company saw „დადასტურებული"
 * the moment a driver took the job, with no way to tell an answered booking
 * from an unanswered one. The row updates over Realtime, so this flips the
 * moment the driver taps confirm.
 */
export function DriverConfirmationBadge({ booking }: Props) {
  const { t } = useTranslation();

  if (booking.status !== 'accepted' && booking.status !== 'in_progress') return null;
  if (!booking.driver_id) return null;

  const confirmed = booking.driver_confirmed_1h === true;

  return (
    <View style={[styles.badge, confirmed ? styles.badgeDone : styles.badgeWaiting]}>
      <Text style={[styles.text, confirmed ? styles.textDone : styles.textWaiting]}>
        {confirmed
          ? `✅ ${t('bookings.driverConfirmedBadge')}`
          : `⏳ ${t('bookings.awaitingDriverConfirm')}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  badgeDone: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  badgeWaiting: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  textDone: {
    color: '#047857',
  },
  textWaiting: {
    color: COLORS.goldDark,
  },
});
