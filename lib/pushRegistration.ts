import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  configureNotificationHandler,
  ensureAndroidNotificationChannel,
} from './notifications';
import { saveDriverPushToken } from './profiles';
import { getSupabaseAnonKey, getSupabaseUrl } from './supabaseEnv';

function resolveEasProjectId(): string | undefined {
  const env = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (env) return env;

  const fromConfig =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  const legacy = Constants.manifest as { extra?: { eas?: { projectId?: string } } } | null | undefined;
  const fromLegacy = legacy?.extra?.eas?.projectId;

  const pick = typeof fromConfig === 'string' && fromConfig.trim() ? fromConfig.trim() : fromLegacy?.trim();
  return pick && pick.length > 0 ? pick : undefined;
}

/**
 * Obtains an Expo push token and stores it on `public.profiles.push_token`.
 * Does not show the system permission dialog unless `requestPermission` is true.
 * @returns Expo push token string, or `null` if unavailable (web, denied, or misconfigured).
 */
export async function registerForPushNotificationsAsync(
  userId: string,
  options?: { requestPermission?: boolean },
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  configureNotificationHandler();
  await ensureAndroidNotificationChannel();

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    console.warn('[push] Missing Supabase env');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    if (!options?.requestPermission) {
      return null;
    }
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
    console.warn('[push] Permission not granted:', finalStatus);
    return null;
  }

  const projectId = resolveEasProjectId();

  if (!projectId) {
    console.warn(
      '[push] EAS projectId missing — add extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID; trying token without explicit project ID',
    );
  } else if (__DEV__) {
    console.log('[push] Using EAS projectId:', projectId.slice(0, 10) + '…');
  }

  try {
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId && projectId.length > 0 ? { projectId } : undefined,
    );
    const token = tokenRes.data;

    const { ok, error } = await saveDriverPushToken(userId, token);
    if (!ok) {
      console.warn('[push] save profiles.push_token:', error?.message);
    }

    return token;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync', e);
    return null;
  }
}

/** @deprecated Use `registerForPushNotificationsAsync` */
export async function registerForPushNotifications(userId: string): Promise<void> {
  await registerForPushNotificationsAsync(userId);
}
