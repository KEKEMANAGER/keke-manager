export const COLORS = {
  background: '#0d0d16',
  surface: '#161628',
  surfaceHigh: '#1e1e35',
  gold: '#F5A623',
  goldLight: '#FFD166',
  goldDark: '#C47D0E',
  white: '#FFFFFF',
  gray: '#888899',
  grayLight: '#BBBBCC',
  border: '#2a2a4a',
  borderLight: '#333355',
  error: '#E24B4A',
  success: '#1D9E75',
};

export const FONTS = {
  regular: { fontFamily: 'System', fontWeight: '400' as const },
  medium: { fontFamily: 'System', fontWeight: '500' as const },
  bold: { fontFamily: 'System', fontWeight: '700' as const },
  black: { fontFamily: 'System', fontWeight: '800' as const },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const SHADOWS = {
  gold: {
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
};