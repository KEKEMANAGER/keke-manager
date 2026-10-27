/**
 * Why a phone gets no push notifications, in the terms a driver can act on.
 *
 * - `none`: notifications work, or there is nothing the driver could do yet
 *   (the permission question has not been answered).
 * - `permission_off`: the driver turned notifications off; the fix is in the
 *   phone's settings.
 * - `update_app`: an Android build made before Firebase was added to the app
 *   cannot get a push token at all; the fix is the new version on Google Play.
 * - `unavailable`: anything else (no network, a phone without Google services,
 *   the web). Nothing a banner could honestly tell the driver to do.
 */
export type PushProblem = 'none' | 'permission_off' | 'update_app' | 'unavailable';

/**
 * expo-notifications on Android rejects with "Make sure to complete the guide at
 * https://docs.expo.dev/push-notifications/fcm-credentials/ : Default FirebaseApp
 * is not initialized …" when the installed build has no Firebase config.
 */
export function isMissingFirebaseError(message: string | null | undefined): boolean {
  return /fcm-credentials|FirebaseApp/i.test(String(message ?? ''));
}

/** The problem behind a failed token request. Only an old Android build is something to act on. */
export function pushProblemFromTokenError(
  platform: string,
  message: string | null | undefined,
): PushProblem {
  return platform === 'android' && isMissingFirebaseError(message) ? 'update_app' : 'unavailable';
}

/**
 * The problem when notifications are not allowed. A question nobody has
 * answered yet is not a problem: the app asks it on its own.
 */
export function pushProblemFromPermission(status: string | null | undefined): PushProblem {
  return status === 'granted' ? 'none' : status === 'denied' ? 'permission_off' : 'none';
}
