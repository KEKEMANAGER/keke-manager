import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export async function notifyBookingConfirmed(): Promise<void> {
  if (isWeb) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'KEKE', body: 'ჯავშანი დადასტურდა ✅' },
    trigger: null,
  });
}

let lastNewOpenBookingNotifyAt = 0;

export async function notifyNewOpenBooking(): Promise<void> {
  if (isWeb) return;
  const now = Date.now();
  if (now - lastNewOpenBookingNotifyAt < 4000) return;
  lastNewOpenBookingNotifyAt = now;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'KEKE', body: 'ახალი შეკვეთა მოვიდა! 🚗' },
    trigger: null,
  });
}
