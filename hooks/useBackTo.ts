import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useAndroidBackHandler } from './useAndroidBackHandler';

/**
 * Back for a detail screen in the company/admin area, with a known fallback.
 *
 * Those screens are hidden tabs, and the area's Tabs navigator now keeps the
 * order screens were visited in (backBehavior "history"), so a plain back
 * returns to the screen the user came from — the companies list he opened a
 * company from, say — still mounted and exactly as he left it. Going back
 * through history matters: navigating "forward" to the previous screen would
 * leave this one behind it, and back from there would bring it up again.
 *
 * When there is nothing to go back to (the screen was opened straight from a
 * notification or a link), the target is opened instead, so back still lands
 * somewhere sensible rather than on the dashboard.
 */
export function useBackTo(target: Href | null | undefined): () => void {
  const router = useRouter();

  // Callers build the href inline; key it by value so the Android listener is
  // not torn down and re-added on every render.
  const key = target ? JSON.stringify(target) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableTarget = useMemo(() => target ?? null, [key]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else if (stableTarget) router.navigate(stableTarget);
    else router.back();
  }, [router, stableTarget]);

  const onHardwareBack = useCallback(() => {
    if (!stableTarget) return false;
    goBack();
    return true;
  }, [goBack, stableTarget]);

  useAndroidBackHandler(onHardwareBack, !!stableTarget);

  return goBack;
}
