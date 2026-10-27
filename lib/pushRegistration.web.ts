import type { PushProblem } from './pushProblem';

/** Web: push tokens are not supported. */
export async function registerForPushNotificationsAsync(_userId: string): Promise<string | null> {
  return null;
}

export async function registerForPushWithStatusAsync(
  _userId: string,
  _options?: { requestPermission?: boolean },
): Promise<{ token: string | null; problem: PushProblem }> {
  return { token: null, problem: 'unavailable' };
}

export async function registerForPushNotifications(_userId: string): Promise<void> {
  await registerForPushNotificationsAsync(_userId);
}
