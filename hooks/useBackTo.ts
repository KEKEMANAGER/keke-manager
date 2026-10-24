import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useAndroidBackHandler } from './useAndroidBackHandler';

/**
 * Back for a screen that lives as a hidden tab.
 *
 * The company/admin area is a Tabs navigator, and every detail screen in it
 * (a user, a voucher, a chat) is a hidden tab. Tabs keep no stack: their
 * `back()` goes to the navigator's first route, which redirects to the
 * dashboard. So "back" from a company opened in the admin panel landed on the
 * main menu instead of the company list.
 *
 * A screen that knows where it was opened from passes that place here and goes
 * back to it explicitly. The place it returns to is still mounted, so its
 * state (the sub-tab, the scroll position) is exactly as the user left it.
 * Without a target the router's own `back()` runs, as before, and the Android
 * back button is left to whatever else handles it.
 */
export function useBackTo(target: Href | null | undefined): () => void {
  const router = useRouter();

  // Callers build the href inline; key it by value so the Android listener is
  // not torn down and re-added on every render.
  const key = target ? JSON.stringify(target) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableTarget = useMemo(() => target ?? null, [key]);

  const goBack = useCallback(() => {
    if (stableTarget) router.navigate(stableTarget);
    else router.back();
  }, [router, stableTarget]);

  const onHardwareBack = useCallback(() => {
    if (!stableTarget) return false;
    router.navigate(stableTarget);
    return true;
  }, [router, stableTarget]);

  useAndroidBackHandler(onHardwareBack, !!stableTarget);

  return goBack;
}
