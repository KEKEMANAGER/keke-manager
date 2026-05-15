import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  configureNotificationHandler,
  ensureAndroidNotificationChannel,
} from './notifications';
import { saveDriverPushToken } from './profiles';

/**
 * Requests notification permissions, obtains an Expo push token, and stores it on `public.profiles.push_token`.
 * @returns Expo push token string, or `null` if unavailable (web, denied, or misconfigured).
 */
export async function registerForPushNotificationsAsync(
  userId: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  configureNotificationHandler();
  await ensureAndroidNotificationChannel();

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (__DEV__) console.warn('[push] Missing Supabase env');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    if (__DEV__) console.warn('[push] Permission not granted:', finalStatus);
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId && __DEV__) {
    console.warn('[push] EAS projectId missing — Expo push token may fail on device builds');
  }

  try {
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenRes.data;

    const { ok, error } = await saveDriverPushToken(userId, token);
    if (!ok) {
      console.warn('[push] save profiles.push_token:', error?.message);
    }

    return token;
  } catch (e) {
    if (__DEV__) console.warn('[push] getExpoPushTokenAsync', e);
    return null;
  }
}

/** @deprecated Use `registerForPushNotificationsAsync` */
export async function registerForPushNotifications(userId: string): Promise<void> {
  await registerForPushNotificationsAsync(userId);
}
