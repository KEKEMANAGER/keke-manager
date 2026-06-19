import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import { bookingIsEmergencyReplacement } from '../lib/emergencyReplacement';
import { DriverTripNavigationButtons } from './DriverTripNavigationButtons';

type Props = {
  booking: Pick<BookingRow, 'is_emergency_replacement'> & Parameters<
    typeof DriverTripNavigationButtons
  >[0]['booking'];
  /** Show route navigation (driver). */
  showNavigate?: boolean;
  compact?: boolean;
};

export function EmergencyReplacementBanner({ booking, showNavigate = false, compact }: Props) {
  const { t } = useTranslation();

  if (!bookingIsEmergencyReplacement(booking)) return null;

  return (
    <View style={[styles.banner, compact && styles.bannerCompact]}>
      <View style={styles.titleRow}>
        <Ionicons name="flash" size={16} color="#B45309" />
        <Text style={styles.title}>{t('emergencyReplacement.replacementBadge')}</Text>
      </View>
      {showNavigate ? <DriverTripNavigationButtons booking={booking} variant="compact" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    borderRadius: RADIUS.card,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    gap: 6,
  },
  bannerCompact: {
    marginTop: SPACING.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
});
