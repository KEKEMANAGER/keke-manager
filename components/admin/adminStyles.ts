import { StyleSheet } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';

export const adminStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardMeta: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.goldTint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  badgeText: {
    color: COLORS.goldDark,
    fontSize: 11,
    fontWeight: '800',
  },
  badgeDanger: {
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
  },
  badgeDangerText: {
    color: COLORS.error,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btnGold: {
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnGoldText: {
    color: '#0f0f0f',
    fontWeight: '800',
    fontSize: 13,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
  },
  btnOutlineText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 13,
  },
  btnDanger: {
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.button,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnDangerText: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: 13,
  },
  empty: {
    color: COLORS.gray,
    fontSize: 15,
    marginTop: SPACING.xl,
    textAlign: 'center',
  },
  errBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.error,
    marginBottom: SPACING.md,
  },
  errText: { color: COLORS.error, fontSize: 14, marginBottom: SPACING.sm },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
  },
  retryText: { color: COLORS.gold, fontWeight: '700' },
});
