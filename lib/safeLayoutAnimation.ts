import { LayoutAnimation, Platform, UIManager } from 'react-native';

/** LayoutAnimation is unreliable on Android (especially New Architecture) and can crash. */
export function safeLayoutAnimation(): void {
  if (Platform.OS !== 'ios') return;
  try {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  } catch {
    // ignore — animation is optional
  }
}
