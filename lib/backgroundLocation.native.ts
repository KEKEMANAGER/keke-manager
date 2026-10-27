import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { reportDriverLocation } from './locations';
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
/**
 * The driver accepted the disclosure about being located while the app is
 * minimized during a trip. It is what lets a dead task be restarted without
 * showing him anything (resumeTripLocation); a decline clears it.
 */
const CONSENT_KEY = 'bg-location:consent';

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

    const locations = (data?.locations ?? []).filter(
      (l) => l?.coords && Number.isFinite(l.coords.latitude) && Number.isFinite(l.coords.longitude),
    );
    if (locations.length === 0) return;

    const last = locations[locations.length - 1]!;

    const driverId = await resolveDriverId();
    if (!driverId) {
      if (__DEV__) console.warn('[bg-location] no driver id — skipping upsert');
      return;
    }

    // Moving: sent at once. Standing: once a minute, so a driver at a stop
    // stays on the map instead of going grey (lib/locations.ts).
    const { error: locErr } = await reportDriverLocation(
      driverId,
      last.coords.latitude,
      last.coords.longitude,
      'background',
    );
    if (locErr && __DEV__) console.warn('[bg-location] upsert failed:', locErr.message);

    // The same points, folded into the driver's own trip: the distance he is
    // paid for, the speed his arrival time is calculated from, and whether he
    // has reached the address. This is the half of the feature that belongs to
    // the person holding the phone, and it only works here — at the wheel the
    // app is behind Maps or a dark screen. Every point of the batch, in order:
    // the batch spans several seconds of road.
    const bookingId = await resolveBookingId();
    if (!bookingId) return;

    try {
      let arrival: Awaited<ReturnType<typeof recordPoint>> = null;
      for (const loc of locations) {
        const result = await recordPoint(
          bookingId,
          { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
          loc.timestamp ?? Date.now(),
        );
        if (result?.justArrived && !arrival) arrival = result;
      }
      if (arrival) {
        const copy = await resolveArrivalCopy();
        await notifyArrival(copy.title, copy.body || arrival.progress.destination?.label || '');
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
      /** The OS granted "Always" / "Allow all the time". */
      backgroundGranted: boolean;
      /**
       * The background task is running: the position keeps updating with the
       * app minimized. True with "While using the app" too — see below.
       */
      running: boolean;
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

    if (!requestBackground) {
      // He declined the disclosure about locating him while the app is
      // minimized: the open screen's foreground watch only, as he chose.
      return { ok: true, backgroundGranted: false, running: false };
    }

    // Persistent location exists here to run a trip: it carries the distance the
    // driver is paid for, the arrival time the passengers are waiting on, and
    // the arrival detection that keeps his hands off the phone. With no trip
    // there is none of that to do, so the OS is never asked to keep locating
    // him; the visible map runs on the foreground watch like any other screen.
    if (!trip) {
      return { ok: true, backgroundGranted, running: false, tripRequired: true };
    }

    const alreadyStarted = await isBackgroundLocationRunning();
    if (alreadyStarted) {
      if (!(await tripTaskOptionsCurrent())) {
        try {
          await startTripTask(notificationTitle, notificationBody);
        } catch (e) {
          if (__DEV__) console.warn('[bg-location] options refresh failed:', e);
        }
      }
      return { ok: true, backgroundGranted, running: true };
    }

    // "Always" is not needed for this. Started now, while he is looking at the
    // GPS screen, the updates carry on after he minimizes the app with
    // "While using the app" as well: on Android through the foreground service
    // and its "GPS active" notification, on iPhone with the blue location
    // indicator. expo-location checks only the foreground permission here for
    // that reason. What "Always" adds is surviving the app being swiped away.
    // Before this, a driver who picked "While using" (most of them) was located
    // only while the app was open, so his pin froze the moment he switched to
    // Maps or locked the screen.
    try {
      await startTripTask(notificationTitle, notificationBody);
    } catch (e) {
      // Location services off, or the OS refused the service. The trip still
      // runs on the open screen's watch, exactly as it did before this change,
      // rather than not tracking at all.
      if (__DEV__) console.warn('[bg-location] background start failed:', e);
      return { ok: true, backgroundGranted, running: false };
    }

    return { ok: true, backgroundGranted, running: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[bg-location] start failed:', msg);
    return { ok: false, reason: 'error', error: msg };
  }
}

/**
 * Bumped whenever tripTaskOptions changes, so a trip whose task was started by
 * an older app version gets the new options the next time the app opens
 * (resumeTripLocation), not only on the next trip.
 *   2 — positions keep coming while the car stands still (was: only on moves
 *       of 15 m, so a driver at a stop vanished from the map).
 */
const TRIP_TASK_OPTIONS_VERSION = '2';
const OPTIONS_VERSION_KEY = 'bg-location:options-version';

async function tripTaskOptionsCurrent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OPTIONS_VERSION_KEY)) === TRIP_TASK_OPTIONS_VERSION;
  } catch {
    return false;
  }
}

/** The trip's task runs, and with this app version's options. */
export async function isTripTaskCurrent(): Promise<boolean> {
  return (await isBackgroundLocationRunning()) && (await tripTaskOptionsCurrent());
}

async function startTripTask(notificationTitle?: string, notificationBody?: string): Promise<void> {
  await Location.startLocationUpdatesAsync(
    LOCATION_TASK_NAME,
    tripTaskOptions(notificationTitle, notificationBody),
  );
  try {
    await AsyncStorage.setItem(OPTIONS_VERSION_KEY, TRIP_TASK_OPTIONS_VERSION);
  } catch {
    // best effort: worst case the options are re-applied once more
  }
}

function tripTaskOptions(
  notificationTitle?: string,
  notificationBody?: string,
): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.High,
    // A fix every 5 s whether the car moves or not (Android), every fix (iPhone):
    // a phone at a sightseeing stop keeps saying where it is. The 15 m the OS
    // used to wait for now lives in the trip's own bookkeeping (TRIP_STEP_M)
    // and in how often a position is written (lib/locations.ts).
    timeInterval: 5000,
    distanceInterval: 0,
    // With the app minimized the fixes arrive in one batch every 10 s instead
    // of waking the app for each one.
    deferredUpdatesInterval: 10_000,
    deferredUpdatesDistance: 0,
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
  };
}

/** Record whether the driver accepted the background-location disclosure. */
export async function setBackgroundTrackingConsent(accepted: boolean): Promise<void> {
  try {
    if (accepted) await AsyncStorage.setItem(CONSENT_KEY, '1');
    else await AsyncStorage.removeItem(CONSENT_KEY);
  } catch {
    // best effort: without the flag a dead task is simply not restarted
  }
}

/**
 * Whether the driver agreed to be located with the app minimized. "Always" can
 * only have been granted after he accepted the disclosure (the app asks for it
 * only then), so it counts for drivers from before the flag existed.
 */
async function hasBackgroundTrackingConsent(): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(CONSENT_KEY)) === '1') return true;
  } catch {
    // fall through to the permission
  }
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted';
  } catch {
    return false;
  }
}

export type ResumeTripLocationOptions = {
  driverId: string;
  bookingId: string;
  notificationTitle?: string;
  notificationBody?: string;
  arrivalTitle?: string;
  arrivalBody?: string;
};

/**
 * Restart a trip's background task that the OS ended.
 *
 * The task starts when the driver begins the trip, but a reboot, the app being
 * swiped away or a phone's battery saver can end it, and nothing started it
 * again: his pin froze for the rest of the trip, "Always" permission or not.
 * Called whenever the app comes to the front during a trip. It never asks for a
 * permission or shows anything — it only resumes what he already turned on, and
 * does nothing if he declined the disclosure or took location away.
 */
export async function resumeTripLocation(options: ResumeTripLocationOptions): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const id = options.driverId?.trim();
  const trip = options.bookingId?.trim();
  if (!id || !trip) return false;
  try {
    if (await isBackgroundLocationRunning()) {
      // Running, but perhaps with the options of an older app version (a trip
      // that was already under way when the update arrived): apply the current
      // ones. Same task, same permission — nothing is asked or shown.
      if (!(await tripTaskOptionsCurrent())) {
        try {
          await startTripTask(options.notificationTitle, options.notificationBody);
        } catch (e) {
          if (__DEV__) console.warn('[bg-location] options refresh failed:', e);
        }
      }
      return true;
    }
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    if (!(await hasBackgroundTrackingConsent())) return false;

    await AsyncStorage.setItem(ACTIVE_DRIVER_KEY, id);
    await AsyncStorage.setItem(ACTIVE_BOOKING_KEY, trip);
    await AsyncStorage.setItem(
      ARRIVAL_COPY_KEY,
      JSON.stringify({
        title: options.arrivalTitle?.trim() || 'KEKE Manager',
        body: options.arrivalBody?.trim() || '',
      }),
    );
    await startTripTask(options.notificationTitle, options.notificationBody);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[bg-location] resume failed:', e);
    return false;
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
