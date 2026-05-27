import {
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type RNStyle = ViewStyle | TextStyle | ImageStyle;

/** Flatten style arrays — required on web (React 19 DOM rejects style[0] assignment). */
export function sx(...styles: Array<StyleProp<RNStyle> | false | undefined | null>): RNStyle {
  return StyleSheet.flatten(styles.filter(Boolean)) as RNStyle;
}

/** Pressable style callback helper — always returns a flat object on web. */
export function pressableSx(
  ...styles: Array<StyleProp<ViewStyle> | false | undefined | null | ((pressed: boolean) => StyleProp<ViewStyle> | false | undefined | null)>
) {
  return ({ pressed }: { pressed: boolean }) => {
    const resolved = styles.map((s) => (typeof s === 'function' ? s(pressed) : s));
    return sx(...resolved);
  };
}
