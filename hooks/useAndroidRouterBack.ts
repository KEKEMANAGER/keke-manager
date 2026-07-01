import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useAndroidBackHandler } from './useAndroidBackHandler';

/** Maps Android hardware back to expo-router `back()`. */
export function useAndroidRouterBack(enabled = true): void {
  const router = useRouter();
  const handler = useCallback(() => {
    router.back();
    return true;
  }, [router]);
  useAndroidBackHandler(handler, enabled);
}
