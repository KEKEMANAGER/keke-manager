import { fetchActiveTripState, fetchTripRunState } from './activeTrip';
import {
  activeTripBookingId,
  isBackgroundLocationRunning,
  isTripTaskCurrent,
  resumeTripLocation,
  stopTripSharing,
} from './backgroundLocation';

export type TripGpsCopy = {
  notificationTitle: string;
  notificationBody: string;
  arrivalTitle: string;
  arrivalBody: string;
};

export type TripGpsCheck = 'stopped' | 'resumed' | 'current' | 'idle';

/**
 * One look at the trip's GPS when the app comes to the front
 * (hooks/useTripLocationKeeper.ts):
 *   - it runs for a trip the server says is over (finished, cancelled or
 *     declined where the phone was not told, by KEKE for instance): sharing
 *     stops ('stopped'), and a trip under way, if any, is resumed;
 *   - it runs for the trip under way with this version's options: nothing to
 *     do ('current');
 *   - a trip is under way and its GPS is gone or has old options: resumed as
 *     the driver turned it on ('resumed'; resumeTripLocation asks for nothing);
 *   - no trip, nothing running: 'idle'.
 * Only a sure answer from the server stops anything; without internet, or
 * for a trip not started yet (GPS turned on early), the running GPS is left
 * alone.
 */
export async function checkTripGps(driverId: string, copy: TripGpsCopy): Promise<TripGpsCheck> {
  let stopped = false;
  if (await isBackgroundLocationRunning()) {
    // The trip this GPS runs for - asked about itself, the same question the
    // trip task asks every minute (a driver's or a fleet owner's trip alike).
    const sharing = await activeTripBookingId();
    const state = sharing ? await fetchTripRunState(sharing) : 'unknown';
    if (state === 'ended') {
      await stopTripSharing(driverId);
      stopped = true;
    } else if (!sharing) {
      // A task with no trip stored (an older app version): stop it only if he
      // surely has no trip under way.
      const any = await fetchActiveTripState(driverId);
      if (any.known && !any.tripId) {
        await stopTripSharing(driverId);
        return 'stopped';
      }
      if (await isTripTaskCurrent()) return 'current';
    } else if (await isTripTaskCurrent()) {
      // Under way (or no answer, no internet) with this version's options.
      return 'current';
    }
  }
  const trip = await fetchActiveTripState(driverId);
  if (!trip.tripId) return stopped ? 'stopped' : 'idle';
  const resumed = await resumeTripLocation({ driverId, bookingId: trip.tripId, ...copy });
  if (stopped) return 'stopped';
  return resumed ? 'resumed' : 'idle';
}
