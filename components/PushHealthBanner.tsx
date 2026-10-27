import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PLAY_STORE_MARKET_URL, PLAY_STORE_URL } from '../lib/appStoreLinks';
import type { PushProblem } from '../lib/pushProblem';
import { registerForPushWithStatusAsync } from '../lib/pushRegistration';
import { PushHealthCard } from './PushHealthCard';

/** Let the app's own permission question show first on a fresh install. */
const FIRST_CHECK_DELAY_MS = 1500;

async function openPlayStore() {
  try {
    await Linking.openURL(PLAY_STORE_MARKET_URL);
  } catch {
    await Linking.openURL(PLAY_STORE_URL).catch(() => undefined);
  }
}

/**
 * Tells a driver whose phone cannot receive new-booking alerts what to do:
 * an Android build from before Firebase → update from Google Play;
 * notifications switched off → turn them on in Settings. Checked again
 * every time the app comes back to the front, so it disappears by itself
 * once the driver has fixed it. Nothing is shown while things work.
 */
export function PushHealthBanner({ userId }: { userId: string | null | undefined }) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<PushProblem>('none');
  /** Once a token came back the phone is fine; the root registration keeps it fresh from then on. */
  const workingRef = useRef(false);

  const check = useCallback(async () => {
    const id = userId?.trim();
    if (!id || workingRef.current) return;
    try {
      const { token, problem: next } = await registerForPushWithStatusAsync(id, {
        requestPermission: false,
      });
      if (token) workingRef.current = true;
      setProblem(next);
    } catch {
      setProblem('none');
    }
  }, [userId]);

  useEffect(() => {
    workingRef.current = false;
    setProblem('none');
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [check]);

  if (problem === 'update_app') {
    return (
      <PushHealthCard
        testID="push-health-update"
        icon="cloud-download-outline"
        title={t('pushHealth.updateTitle')}
        body={t('pushHealth.updateBody')}
        actions={[
          { label: t('pushHealth.updateButton'), icon: 'logo-google-playstore', onPress: () => void openPlayStore() },
        ]}
      />
    );
  }

  if (problem === 'permission_off') {
    return (
      <PushHealthCard
        testID="push-health-permission"
        icon="notifications-off-outline"
        title={t('pushHealth.permissionTitle')}
        body={t('pushHealth.permissionBody')}
        actions={[
          {
            label: t('pushHealth.permissionButton'),
            icon: 'settings-outline',
            onPress: () => void Linking.openSettings().catch(() => undefined),
          },
        ]}
      />
    );
  }

  return null;
}
