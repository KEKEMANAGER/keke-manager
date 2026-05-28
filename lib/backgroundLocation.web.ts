export const LOCATION_TASK_NAME = 'driver-background-location';

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return false;
}

export type StartBackgroundLocationResult =
  | { ok: true; backgroundGranted: boolean }
  | { ok: false; reason: 'web' | 'foreground_denied' | 'error'; error?: string };

export type StartBackgroundLocationOptions = {
  driverId: string;
  bookingId?: string | null;
  notificationTitle?: string;
  notificationBody?: string;
};

export async function startBackgroundLocation(
  _options: StartBackgroundLocationOptions,
): Promise<StartBackgroundLocationResult> {
  return { ok: false, reason: 'web' };
}

export async function stopBackgroundLocation(): Promise<void> {}
