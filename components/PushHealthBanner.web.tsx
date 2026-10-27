import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { APP_STORE_URL, PLAY_STORE_URL, storesForUserAgent } from '../lib/appStoreLinks';
import { PushHealthCard, type PushHealthAction } from './PushHealthCard';

const DISMISS_KEY = 'keke_get_app_banner_closed_at';
/** Closing the banner hides it for a week, then it asks again. */
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode or blocked storage: the banner simply comes back next time.
  }
}

/**
 * A driver working from the website: new-booking alerts reach a phone most
 * reliably through the app, so offer it — the right store for this phone,
 * both on a computer. Closable; it returns after a week.
 */
export function PushHealthBanner({ userId }: { userId: string | null | undefined }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(Boolean(userId) && !dismissedRecently());
  }, [userId]);

  if (!visible) return null;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const actions: PushHealthAction[] = storesForUserAgent(ua).map((store) =>
    store === 'play'
      ? {
          label: t('pushHealth.googlePlay'),
          icon: 'logo-google-playstore',
          onPress: () => void Linking.openURL(PLAY_STORE_URL),
        }
      : {
          label: t('pushHealth.appStore'),
          icon: 'logo-apple',
          onPress: () => void Linking.openURL(APP_STORE_URL),
        },
  );

  return (
    <PushHealthCard
      testID="push-health-get-app"
      icon="phone-portrait-outline"
      title={t('pushHealth.getAppTitle')}
      body={t('pushHealth.getAppBody')}
      actions={actions}
      closeLabel={t('pushHealth.close')}
      onClose={() => {
        rememberDismissed();
        setVisible(false);
      }}
    />
  );
}
