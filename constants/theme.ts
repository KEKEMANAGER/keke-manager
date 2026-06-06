export const COLORS = {
  background: '#FFFFFF',
  surface: '#F8F9FA',
  surfaceAlt: '#F0F1F3',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  gold: '#F5A623',
  goldLight: '#FBBF24',
  goldDark: '#D4920B',
  border: '#E5E7EB',
  borderFocus: '#F5A623',
  error: '#EF4444',
  success: '#10B981',
  white: '#FFFFFF',
  black: '#1A1A2E',
  /** @deprecated Use textMuted */
  gray: '#9CA3AF',
  /** @deprecated Use textSecondary */
  grayLight: '#6B7280',
  /** @deprecated Use surfaceAlt */
  surfaceHigh: '#F0F1F3',
  /** @deprecated Use border */
  borderLight: '#E5E7EB',
  goldTint: '#FFFBF0',
  blue: '#3B82F6',
  blueTint: '#EFF6FF',
};

export const FONTS = {
  regular: { fontFamily: 'System', fontWeight: '400' as const },
  medium: { fontFamily: 'System', fontWeight: '500' as const },
  semibold: { fontFamily: 'System', fontWeight: '600' as const },
  bold: { fontFamily: 'System', fontWeight: '700' as const },
  black: { fontFamily: 'System', fontWeight: '800' as const },
};

export const TYPOGRAPHY = {
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: COLORS.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  heading: {
    fontWeight: '700' as const,
    color: COLORS.text,
  },
  body: {
    fontWeight: '400' as const,
    color: COLORS.text,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  input: 8,
  button: 10,
  card: 12,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardStrong: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  button: {
    shadowColor: '#F5A623',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** @deprecated Use SHADOWS.button */
  gold: {
    shadowColor: '#F5A623',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
};
