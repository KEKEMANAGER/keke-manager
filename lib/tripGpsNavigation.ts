import type { Router } from 'expo-router';
import { InteractionManager, Platform } from 'react-native';

/** Open driver GPS screen and auto-start tracking after a trip begins. */
export function navigateToTripGps(router: Router, bookingId: string): void {
  const id = bookingId.trim();
  if (!id || Platform.OS === 'web') return;

  InteractionManager.runAfterInteractions(() => {
    router.push({
      pathname: '/(driver)/gps',
      params: { autoStart: '1', bookingId: id },
    });
  });
}
