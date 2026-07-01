import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { upsertDriverLocation } from './locations';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'driver-background-location';

/** Stored alongside the task so it survives JS-context restarts triggered by the OS. */
const ACTIVE_DRIVER_KEY = 'bg-location:active-driver-id';
const ACTIVE_BOOKING_KEY = 'bg-location:active-booking-id';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

/**
 * Resolve the driver id that owns the currently active background trip.
 * Reads from AsyncStorage first (set by start), then falls back to the live Supabase session.
 */
async function resolveDriverId(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_DRIVER_KEY);
    const trimmed = stored?.trim();
    if (trimmed) return trimmed;
  } catch {
    // ignore — fall through to session lookup
  }
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id?.trim();
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Background location task. Registered once at module load so the OS can wake the JS
 * context and deliver location batches even while the app is backgrounded or killed.
 */
if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
  TaskManager.defineTask<LocationTaskData>(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      if (__DEV__) console.warn('[bg-location] task error:', error.message);
      return;
    }

    const locations = data?.locations;
    if (!locations || locations.length === 0) return;

    const last = locations[locations.length - 1];
    if (!last?.coords) return;

    const driverId = await resolveDriverId();
    if (!driverId) {
      if (__DEV__) console.warn('[bg-location] no driver id — skipping upsert');
      return;
    }

    const { error: locErr } = await upsertDriverLocation(
      driverId,
      last.coords.latitude,
      last.coords.longitude,
    );
    if (locErr && __DEV__) console.warn('[bg-location] upsert failed:', locErr.message);
  });
}

/** True when the OS is currently delivering background location updates to our task. */
export async function isBackgroundLocationRunning(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export type StartBackgroundLocationResult =
  | { ok: true; backgroundGranted: boolean }
  | { ok: false; reason: 'web' | 'foreground_denied' | 'error'; error?: string };

export type StartBackgroundLocationOptions = {
  /** Supabase user id of the driver running the trip. */
  driverId: string;
  /** Optional booking id, stored for context/logging. */
  bookingId?: string | null;
  /** Localized title for the Android foreground-service notification. */
  notificationTitle?: string;
  /** Localized body for the Android foreground-service notification. */
  notificationBody?: string;
  /**
   * When false, skips background permission request and background updates (foreground-only).
   * Use after the user declines the prominent disclosure dialog.
   */
  requestBackground?: boolean;
};

/**
 * Request permissions and start background location updates for the given driver.
 * Falls back to foreground-only if the user denies background permission.
 */
export async function startBackgroundLocation(
  options: StartBackgroundLocationOptions,
): Promise<StartBackgroundLocationResult> {
  const { driverId, bookingId, notificationTitle, notificationBody } = options;
  const requestBackground = options.requestBackground !== false;
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };

  const id = driverId?.trim();
  if (!id) return { ok: false, reason: 'error', error: 'missing_driver_id' };

  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      return { ok: false, reason: 'foreground_denied' };
    }

    let backgroundGranted = false;
    if (requestBackground) {
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        backgroundGranted = bg.status === 'granted';
      } catch (e) {
        if (__DEV__) console.warn('[bg-location] background permission request failed:', e);
      }
    }

    await AsyncStorage.setItem(ACTIVE_DRIVER_KEY, id);
    if (bookingId && bookingId.trim().length > 0) {
      await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, bookingId.trim());
    } else {
      await AsyncStorage.removeItem(ACTIVE_BOOKING_KEY);
    }

    if (!backgroundGranted) {
      // No background permission — caller still uses watchPositionAsync for foreground.
      return { ok: true, backgroundGranted: false };
    }

    const alreadyStarted = await isBackgroundLocationRunning();
    if (alreadyStarted) {
      return { ok: true, backgroundGranted: true };
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 15,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: notificationTitle?.trim() || 'KEKE · GPS active',
        notificationBody:
          notificationBody?.trim() ||
          'Sharing your location with the company while the trip is active.',
        notificationColor: '#D4AF37',
      },
      activityType: Location.ActivityType.AutomotiveNavigation,
    });

    return { ok: true, backgroundGranted: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[bg-location] start failed:', msg);
    return { ok: false, reason: 'error', error: msg };
  }
}

/** Stop background updates (no-op if not running) and clear stored trip context. */
export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const running = await isBackgroundLocationRunning();
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (e) {
    if (__DEV__) console.warn('[bg-location] stop failed:', e);
  }
  try {
    await AsyncStorage.multiRemove([ACTIVE_DRIVER_KEY, ACTIVE_BOOKING_KEY]);
  } catch {
    // ignore
  }
}
