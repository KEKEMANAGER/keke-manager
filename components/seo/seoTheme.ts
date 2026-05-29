import { Platform } from 'react-native';

/** Self-contained theme for SEO landing pages (avoid landingTheme in async web chunks). */
export const SEO_THEME = {
  white: '#ffffff',
  text: '#0a0a0a',
  accent: '#EF9F27',
  accentLight: '#FAEEDA',
  bgSoft: '#fafafa',
  dark: '#0a0a0a',
  border: '#e8e8e8',
  muted: '#5c5c5c',
} as const;

const interFamily = Platform.select({
  web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  default: 'System',
});

export function seoFont(extra?: object) {
  return {
    fontFamily: interFamily,
    ...extra,
  };
}
