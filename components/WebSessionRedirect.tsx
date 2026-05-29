import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * On the public landing page, defer session lookup so Supabase stays out of the initial bundle.
 * Logged-in users are redirected once the browser is idle.
 */
export function WebSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const run = async () => {
      const { supabase } = await import('../lib/supabase');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      const role = userRow?.role;
      if (role === 'driver') {
        router.replace('/(driver)/dashboard');
      } else if (role === 'company' || role === 'admin') {
        router.replace('/(app)/dashboard');
      } else {
        router.replace('/(auth)/pending');
      }
    };

    const schedule =
      typeof requestIdleCallback === 'function'
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 5000 })
        : (cb: () => void) => window.setTimeout(cb, 1500);

    const id = schedule(() => {
      void run();
    });

    return () => {
      if (typeof cancelIdleCallback === 'function' && typeof id === 'number') {
        cancelIdleCallback(id);
      } else {
        clearTimeout(id as number);
      }
    };
  }, [router]);

  return null;
}
