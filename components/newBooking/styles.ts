import { StyleSheet } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';

export const newBookingStyles = StyleSheet.create({
  serviceCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
    minHeight: 52,
  },
  serviceCheckboxRowActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  serviceCheckboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCheckboxBoxActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold,
  },
  serviceCheckboxLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  serviceCheckboxLabelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  step1Hint: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  step1Error: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: SPACING.sm,
  },
});
