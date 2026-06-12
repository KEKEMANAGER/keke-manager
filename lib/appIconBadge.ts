import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Home-screen app icon badge (iOS / supported Android launchers). */
export async function syncAppIconBadgeCount(unread: number): Promise<void> {
  if (Platform.OS === 'web') return;
  const count = Math.max(0, Math.min(unread, 99));
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (e) {
    if (__DEV__) {
      console.warn('[badge] setBadgeCountAsync:', e instanceof Error ? e.message : e);
    }
  }
}
