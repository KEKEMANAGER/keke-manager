import { Platform } from 'react-native';

export { pressableSx, sx } from '../../lib/sx';

export const LANDING = {
  white: '#ffffff',
  text: '#0a0a0a',
  accent: '#EF9F27',
  accentLight: '#FAEEDA',
  bgSoft: '#fafafa',
  dark: '#0a0a0a',
  darkGradientEnd: '#1a1100',
  border: '#e8e8e8',
  muted: '#5c5c5c',
} as const;

export function landingFont(extra?: object) {
  return {
    fontFamily: Platform.select({
      web: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      default: 'System',
    }),
    ...extra,
  };
}
