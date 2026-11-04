import { clearDriverLocation, resetLocationReporting } from './locations';

export const LOCATION_TASK_NAME = 'driver-background-location';

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return false;
}

export async function isTripTaskCurrent(): Promise<boolean> {
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

/** No background task on the web: the pace is reset and the position taken off the maps. */
export async function stopTripSharing(driverId?: string | null): Promise<void> {
  resetLocationReporting();
  const id = driverId?.trim();
  if (!id) return;
  try {
    await clearDriverLocation(id);
  } catch {
    // best effort: the server's tidy job removes it too
  }
}

export async function activeTripBookingId(): Promise<string | null> {
  return null;
}

/** No stored trip on the web: with evenIfNoneShared the driver's pin goes, as with stopTripSharing. */
export async function stopTripSharingFor(
  _bookingId: string,
  driverId?: string | null,
  options: { evenIfNoneShared?: boolean } = {},
): Promise<boolean> {
  if (!options.evenIfNoneShared) return false;
  await stopTripSharing(driverId);
  return true;
}

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

export type ReviveTripGpsResult = 'no_trip' | 'running' | 'restarted' | 'reported' | 'failed';

/** Phones only: nothing runs in the background on the web. */
export async function reviveTripGps(): Promise<ReviveTripGpsResult> {
  return 'no_trip';
}
