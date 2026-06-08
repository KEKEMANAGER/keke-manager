import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type Props = {
  compact?: boolean;
  /** Voucher / print layouts — text only, no emoji prefix. */
  hideEmoji?: boolean;
};

export function GuideDriverBadge({ compact, hideEmoji }: Props) {
  const { t } = useTranslation();
  return (
    <Text style={[styles.badge, compact && styles.badgeCompact]} accessibilityRole="text">
      {hideEmoji ? t('driver.guideBadge') : `🎓 ${t('driver.guideBadge')}`}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  badgeCompact: {
    fontSize: 11,
    paddingHorizontal: 6,
  },
});
