import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS } from '../constants/theme';

type Props = {
  /** Smaller, for list rows and next to a name. */
  compact?: boolean;
};

/**
 * "KEKE Certified" — a driver the admin certified after the KEKE training and
 * a short test (lib/kekeCertified.ts). The brand name stays as it is in every
 * language.
 */
export function KekeCertifiedBadge({ compact }: Props) {
  const { t } = useTranslation();
  const label = t('certified.badge');
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Ionicons name="ribbon" size={compact ? 10 : 12} color={COLORS.black} />
      <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.black,
    letterSpacing: 0.2,
  },
  textCompact: {
    fontSize: 10.5,
  },
});
