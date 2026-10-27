import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  configureNotificationHandler,
  ensureAndroidNotificationChannel,
} from './notifications';
import { saveDriverPushToken } from './profiles';
import {
  pushProblemFromPermission,
  pushProblemFromTokenError,
  type PushProblem,
} from './pushProblem';
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

export type PushRegistrationResult = {
  /** Expo push token, or `null` when the phone cannot get one. */
  token: string | null;
  /** Why there is no token, in terms the driver can act on (lib/pushProblem.ts). */
  problem: PushProblem;
};

/**
 * Obtains an Expo push token and stores it on `public.profiles.push_token`.
 * Does not show the system permission dialog unless `requestPermission` is true.
 * @returns Expo push token string, or `null` if unavailable (web, denied, or misconfigured).
 */
export async function registerForPushNotificationsAsync(
  userId: string,
  options?: { requestPermission?: boolean },
): Promise<string | null> {
  return (await registerForPushWithStatusAsync(userId, options)).token;
}

/**
 * The same registration, also saying why it failed — so the driver dashboard
 * can tell a driver on an old Android build to update, or one who switched
 * notifications off to switch them on (components/PushHealthBanner.tsx).
 */
export async function registerForPushWithStatusAsync(
  userId: string,
  options?: { requestPermission?: boolean },
): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return { token: null, problem: 'unavailable' };

  configureNotificationHandler();
  await ensureAndroidNotificationChannel();

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    console.warn('[push] Missing Supabase env');
    return { token: null, problem: 'unavailable' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    if (!options?.requestPermission) {
      return { token: null, problem: pushProblemFromPermission(existing) };
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
    return { token: null, problem: 'permission_off' };
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

    return { token, problem: 'none' };
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync', e);
    const message = e instanceof Error ? e.message : String(e ?? '');
    return { token: null, problem: pushProblemFromTokenError(Platform.OS, message) };
  }
}

/** @deprecated Use `registerForPushNotificationsAsync` */
export async function registerForPushNotifications(userId: string): Promise<void> {
  await registerForPushNotificationsAsync(userId);
}
