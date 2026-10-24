export const LOCATION_TASK_NAME = 'driver-background-location';

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return false;
}

export type StartBackgroundLocationResult =
  | {
      ok: true;
      backgroundGranted: boolean;
      /** The background task is running (never on web). */
      running: boolean;
      /** Background was skipped because there is no active trip, not because it was refused. */
      tripRequired?: boolean;
    }
  | { ok: false; reason: 'web' | 'foreground_denied' | 'error'; error?: string };

export type StartBackgroundLocationOptions = {
  driverId: string;
  bookingId?: string | null;
  notificationTitle?: string;
  notificationBody?: string;
  arrivalTitle?: string;
  arrivalBody?: string;
  requestBackground?: boolean;
};

export async function startBackgroundLocation(
  _options: StartBackgroundLocationOptions,
): Promise<StartBackgroundLocationResult> {
  return { ok: false, reason: 'web' };
}

export async function stopBackgroundLocation(): Promise<void> {}

export async function setBackgroundTrackingConsent(_accepted: boolean): Promise<void> {}

export type ResumeTripLocationOptions = {
  driverId: string;
  bookingId: string;
  notificationTitle?: string;
  notificationBody?: string;
  arrivalTitle?: string;
  arrivalBody?: string;
};

export async function resumeTripLocation(_options: ResumeTripLocationOptions): Promise<boolean> {
  return false;
}
