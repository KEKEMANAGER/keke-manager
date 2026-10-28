import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { reviveTripGps } from './backgroundLocation';

/**
 * The server's "are you there?" for a trip whose phone went quiet.
 *
 * watch_trip_gps() (supabase/migrations/20261028120000_trip_events_trail_gps_watch.sql)
 * sends a push with no title and no text. Android starts the app for it even
 * when the phone's battery saver had stopped it, and this task then reports
 * where the car is, restarts the trip's GPS and sends what waited for the
 * internet. The driver sees nothing; the company sees the pin move again.
 */
export const GPS_WAKE_TASK = 'keke-gps-wake';

type WakePayload = { type?: string; booking_id?: string };

/** The push's data, wherever the platform put it. */
export function wakePayload(raw: unknown): WakePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  if ('actionIdentifier' in (raw as Record<string, unknown>)) return null; // a tap, not a delivery
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.dataString === 'string') {
    try {
      const parsed = JSON.parse(d.dataString) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as WakePayload;
    } catch {
      return null;
    }
  }
  if (typeof d.body === 'string') {
    try {
      const parsed = JSON.parse(d.body) as unknown;
      if (parsed && typeof parsed === 'object' && 'type' in (parsed as object)) return parsed as WakePayload;
    } catch {
      // not JSON: fall through to the flat shape
    }
  }
  return d as WakePayload;
}

if (!TaskManager.isTaskDefined(GPS_WAKE_TASK)) {
  TaskManager.defineTask(GPS_WAKE_TASK, async ({ data, error }) => {
    if (error) return;
    // The task sees every notification; only the quiet trip's one is for us.
    if (wakePayload(data)?.type !== 'gps_wake') return;
    try {
      await reviveTripGps();
    } catch (e) {
      if (__DEV__) console.warn('[gps-wake] revive failed:', e);
    }
  });
}

void Notifications.registerTaskAsync(GPS_WAKE_TASK).catch((e: unknown) => {
  if (__DEV__) console.warn('[gps-wake] register failed:', e);
});
