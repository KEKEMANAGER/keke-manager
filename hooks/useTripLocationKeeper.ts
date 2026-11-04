import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { checkTripGps } from '../lib/tripGpsKeeper';

/**
 * Keeps a running trip's background GPS alive.
 *
 * The background task is started when the driver begins a trip. The phone can
 * end it later — a restart, the app swiped away, the battery saver — and
 * nothing started it again, so his pin stayed where it was for the rest of the
 * trip whatever his location permission was. Whenever the app comes to the
 * front during an in-progress trip, this checks the task and restarts it if it
 * is gone. It asks for nothing and shows nothing; it only resumes what the
 * driver already turned on (see resumeTripLocation).
 *
 * The other way round too: when the trip's GPS still runs but the server says
 * the trip is no longer in progress - finished or cancelled where the phone
 * was not told, by KEKE for instance - it stops sharing (stopTripSharing).
 * Only a sure answer stops it; without internet nothing changes. The look
 * itself is lib/tripGpsKeeper.ts (checkTripGps).
 */
export function useTripLocationKeeper(driverId: string | null | undefined): void {
  const { t } = useTranslation();
  const busy = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !driverId) return;

    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await checkTripGps(driverId, {
          notificationTitle: t('gpsScreen.bgServiceTitle'),
          notificationBody: t('gpsScreen.bgServiceBody'),
          arrivalTitle: t('gpsScreen.arrivalTitle'),
          arrivalBody: t('gpsScreen.arrivalBody'),
        });
      } catch (e) {
        if (__DEV__) console.warn('[trip-gps] keeper check failed:', e);
      } finally {
        busy.current = false;
      }
    };

    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [driverId, t]);
}
