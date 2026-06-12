import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  openExternalNavigation,
  tripNavigationTargets,
  type TripNavigationTargets,
} from '../lib/openExternalNavigation';

type TripNavBooking = Parameters<typeof tripNavigationTargets>[0];

type Props = {
  booking: TripNavBooking;
  /** compact = icon row for booking cards; panel = GPS footer card */
  variant?: 'compact' | 'panel';
  targets?: TripNavigationTargets;
};

export function DriverTripNavigationButtons({
  booking,
  variant = 'panel',
  targets: targetsProp,
}: Props) {
  const { t } = useTranslation();
  const targets = targetsProp ?? tripNavigationTargets(booking);
  const { pickup, destination } = targets;

  if (!pickup && !destination) return null;

  async function navigate(query: string | null) {
    if (!query) return;
    await openExternalNavigation(query);
  }

  if (variant === 'compact') {
    return (
      <View style={styles.compactRow}>
        {pickup ? (
          <Pressable
            onPress={() => void navigate(pickup)}
            style={({ pressed }) => [styles.compactBtn, pressed && styles.pressed]}
          >
            <Ionicons name="navigate" size={16} color={COLORS.goldDark} />
            <Text style={styles.compactBtnText}>{t('gpsScreen.navigatePickup')}</Text>
          </Pressable>
        ) : null}
        {destination ? (
          <Pressable
            onPress={() => void navigate(destination)}
            style={({ pressed }) => [styles.compactBtn, pressed && styles.pressed]}
          >
            <Ionicons name="flag" size={16} color={COLORS.goldDark} />
            <Text style={styles.compactBtnText}>{t('gpsScreen.navigateDestination')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {pickup ? (
        <Pressable
          onPress={() => void navigate(pickup)}
          style={({ pressed }) => [styles.panelBtn, styles.panelBtnPrimary, pressed && styles.pressed]}
        >
          <Ionicons name="navigate" size={18} color="#0f0f0f" />
          <Text style={styles.panelBtnPrimaryText}>{t('gpsScreen.navigatePickup')}</Text>
        </Pressable>
      ) : null}
      {destination ? (
        <Pressable
          onPress={() => void navigate(destination)}
          style={({ pressed }) => [styles.panelBtn, styles.panelBtnOutline, pressed && styles.pressed]}
        >
          <Ionicons name="flag-outline" size={18} color={COLORS.goldDark} />
          <Text style={styles.panelBtnOutlineText}>{t('gpsScreen.navigateDestination')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  panelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
  },
  panelBtnPrimary: {
    backgroundColor: COLORS.gold,
  },
  panelBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f0f0f',
  },
  panelBtnOutline: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  panelBtnOutlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  compactRow: {
    flexDirection: 'column',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
    width: '100%',
  },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignSelf: 'stretch',
    width: '100%',
  },
  compactBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  pressed: {
    opacity: 0.9,
  },
});
