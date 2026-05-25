import { Platform } from 'react-native';
import { SPACING } from './theme';

/** Body height of the app header row (excluding safe-area inset). */
export const APP_HEADER_BODY_HEIGHT = 56;

export const CONTENT_PADDING_BOTTOM = 80;

export const Z_INDEX = {
  modal: 1000,
  dropdown: 100,
  header: 50,
  tabBar: 50,
  floating: 40,
  content: 1,
} as const;

export const DRAWER_WIDTH = 280;

export function tabBarMinHeight(bottomInset: number): number {
  const base = Platform.OS === 'web' ? 72 : 64;
  return base + Math.max(bottomInset, SPACING.sm);
}
