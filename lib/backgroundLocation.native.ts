import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { upsertDriverLocation } from './locations';
import { supabase } from './supabase';
import { notifyArrival, recordPoint } from './tripProgress';

export const LOCATION_TASK_NAME = 'driver-background-location';

/** Stored alongside the task so it survives JS-context restarts triggered by the OS. */
const ACTIVE_DRIVER_KEY = 'bg-location:active-driver-id';
const ACTIVE_BOOKING_KEY = 'bg-location:active-booking-id';
/**
 * The arrival banner's wording, translated once when the trip starts.
 *
 * The task runs outside React, so it has no `t()` and no idea which of the four
 * languages the driver reads. Whoever starts the trip does know, so the two
 * sentences are stored alongside the trip and read back verbatim.
 */
const ARRIVAL_COPY_KEY = 'bg-location:arrival-copy';

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

/** The trip these locations belong to, or null when GPS is running without one. */
async function resolveBookingId(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_BOOKING_KEY);
    const trimmed = stored?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function resolveArrivalCopy(): Promise<{ title: string; body: string }> {
  try {
    const raw = await AsyncStorage.getItem(ARRIVAL_COPY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { title?: string; body?: string };
      return {
        title: String(parsed?.title ?? '').trim() || 'KEKE Manager',
        body: String(parsed?.body ?? '').trim(),
      };
    }
  } catch {
    // fall through to the neutral wording
  }
  return { title: 'KEKE Manager', body: '' };
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

    // The same points, folded into the driver's own trip: the distance he is
    // paid for, the speed his arrival time is calculated from, and whether he
    // has reached the address. This is the half of the feature that belongs to
    // the person holding the phone, and it only works here — at the wheel the
    // app is behind Maps or a dark screen.
    const bookingId = await resolveBookingId();
    if (!bookingId) return;

    try {
      const result = await recordPoint(
        bookingId,
        { latitude: last.coords.latitude, longitude: last.coords.longitude },
        last.timestamp ?? Date.now(),
      );
      if (result?.justArrived) {
        const copy = await resolveArrivalCopy();
        await notifyArrival(copy.title, copy.body || result.progress.destination?.label || '');
      }
    } catch (e) {
      if (__DEV__) console.warn('[bg-location] trip progress failed:', e);
    }
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
  | {
      ok: true;
      backgroundGranted: boolean;
      /** Background was skipped because there is no active trip, not because it was refused. */
      tripRequired?: boolean;
    }
  | { ok: false; reason: 'web' | 'foreground_denied' | 'error'; error?: string };

export type StartBackgroundLocationOptions = {
  /** Supabase user id of the driver running the trip. */
  driverId: string;
  /**
   * The trip being run. Background updates are only started with one: see the
   * comment at the gate below.
   */
  bookingId?: string | null;
  /** Localized title for the banner shown when the driver reaches the address. */
  arrivalTitle?: string;
  /** Localized body for that banner. */
  arrivalBody?: string;
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
  const { driverId, bookingId, notificationTitle, notificationBody, arrivalTitle, arrivalBody } =
    options;
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
    const trip = bookingId?.trim() ?? '';
    if (trip) {
      await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, trip);
      await AsyncStorage.setItem(
        ARRIVAL_COPY_KEY,
        JSON.stringify({
          title: arrivalTitle?.trim() || 'KEKE Manager',
          body: arrivalBody?.trim() || '',
        }),
      );
    } else {
      await AsyncStorage.multiRemove([ACTIVE_BOOKING_KEY, ARRIVAL_COPY_KEY]);
    }

    if (!backgroundGranted) {
      // No background permission — caller still uses watchPositionAsync for foreground.
      return { ok: true, backgroundGranted: false };
    }

    // Persistent location exists here to run a trip: it carries the distance the
    // driver is paid for, the arrival time the passengers are waiting on, and
    // the arrival detection that keeps his hands off the phone. With no trip
    // there is none of that to do, so the OS is never asked to keep locating
    // him; the visible map runs on the foreground watch like any other screen.
    if (!trip) {
      return { ok: true, backgroundGranted: false, tripRequired: true };
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
    await AsyncStorage.multiRemove([ACTIVE_DRIVER_KEY, ACTIVE_BOOKING_KEY, ARRIVAL_COPY_KEY]);
  } catch {
    // ignore
  }
}
