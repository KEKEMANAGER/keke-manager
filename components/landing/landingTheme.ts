import {
  Platform,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type RNStyle = ViewStyle | TextStyle | ImageStyle;

/** Flatten style arrays on web — avoids CSSStyleDeclaration crash with conditional entries. */
export function sx(...styles: Array<StyleProp<RNStyle> | false | undefined | null>): RNStyle {
  return StyleSheet.flatten(styles.filter(Boolean)) as RNStyle;
}

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
    ...(Platform.OS === 'web'
      ? {
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }
      : { fontFamily: 'System' }),
    ...extra,
  };
}
