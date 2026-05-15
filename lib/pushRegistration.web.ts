/** Web: push tokens are not supported. */
export async function registerForPushNotificationsAsync(_userId: string): Promise<string | null> {
  return null;
}

export async function registerForPushNotifications(_userId: string): Promise<void> {
  await registerForPushNotificationsAsync(_userId);
}
