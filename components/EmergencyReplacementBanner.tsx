import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import type { BookingRow } from '../lib/bookings';
import {
  breakdownNavigationQuery,
  formatBreakdownLocationDisplay,
  bookingIsEmergencyReplacement,
} from '../lib/emergencyReplacement';
import { openExternalNavigation } from '../lib/openExternalNavigation';

type Props = {
  booking: Pick<
    BookingRow,
    'is_emergency_replacement' | 'breakdown_location' | 'breakdown_location_type'
  >;
  /** Show navigate button (driver). */
  showNavigate?: boolean;
  compact?: boolean;
};

export function EmergencyReplacementBanner({ booking, showNavigate = false, compact }: Props) {
  const { t } = useTranslation();

  if (!bookingIsEmergencyReplacement(booking)) return null;

  const locationLabel = formatBreakdownLocationDisplay(booking);
  const navQuery = breakdownNavigationQuery(booking);

  return (
    <View style={[styles.banner, compact && styles.bannerCompact]}>
      <View style={styles.titleRow}>
        <Ionicons name="warning" size={16} color="#B45309" />
        <Text style={styles.title}>{t('emergencyReplacement.replacementBadge')}</Text>
      </View>
      {locationLabel ? (
        <Text style={styles.location}>{locationLabel}</Text>
      ) : (
        <Text style={styles.locationMuted}>{t('emergencyReplacement.noBreakdownLocation')}</Text>
      )}
      {showNavigate && navQuery ? (
        <Pressable
          onPress={() => void openExternalNavigation(navQuery)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
        >
          <Ionicons name="navigate" size={14} color={COLORS.white} />
          <Text style={styles.navBtnText}>{t('emergencyReplacement.navigateBreakdown')}</Text>
        </Pressable>
      ) : null}
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
  location: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    lineHeight: 18,
  },
  locationMuted: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    borderRadius: RADIUS.button,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  navBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.88,
  },
});
