import { usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCurrentRoute } from '../lib/routerPaths';
import { getUserRole } from '../lib/role';

/** Redirects authenticated / unauthenticated users inside (auth), (app), and (driver) groups. */
export function AuthenticatedRouteGuard() {
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const segments = useSegments();
  const router = useRouter();
  const role = getUserRole(profile);

  useEffect(() => {
    if (loading) return;

    const root = segments[0];
    const inAuth = root === '(auth)';
    const inApp = root === '(app)';
    const inDriver = root === '(driver)';

    const matchesAuthPath = (slug: string) =>
      pathname === `/${slug}` || pathname.endsWith(`/${slug}`) || segments.includes(slug);

    const onSignInRoute = matchesAuthPath('sign-in');
    const onPasswordRecoveryRoute =
      matchesAuthPath('reset-password') || matchesAuthPath('forgot-password');

    let target: string | null = null;

    if (!userId && (inApp || inDriver)) {
      target = '/sign-in';
    } else if (userId && inAuth && role && !onPasswordRecoveryRoute) {
      target = role === 'driver' ? '/(driver)/dashboard' : '/(app)/dashboard';
    } else if (userId && role === 'driver' && inApp) {
      target = '/(driver)/dashboard';
    } else if (userId && (role === 'company' || role === 'admin') && inDriver) {
      target = '/(app)/dashboard';
    }

    if (onSignInRoute) {
      target = null;
    }

    if (target && !isCurrentRoute(segments, target)) {
      router.replace(target);
    }
  }, [loading, userId, role, segments, router]);

  return null;
}
