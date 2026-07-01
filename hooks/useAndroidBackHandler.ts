import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Wire Android hardware back to a handler. Return true when the event is consumed.
 */
export function useAndroidBackHandler(handler: () => boolean, enabled = true): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [handler, enabled]);
}
