import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, type DimensionValue, StyleSheet, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { COLORS } from '../constants/theme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { dismissLcpShell } from '../lib/lcpShell';
import { getUserRole } from '../lib/role';
import { isCurrentRoute } from '../lib/routerPaths';
import i18n, { initI18n } from '../src/lib/i18n';

// Keep SEO routes in the main web bundle (async chunks break shared module ids in production).
import '../components/seo/ProgrammaticSeoPage';

function WebRootStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'expo-web-root-layout';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = [
      'html,body{height:100%;margin:0;background:#FFFFFF;}',
      'body{overflow:auto;}',
      '#root{height:100%;min-height:100%;display:flex;flex:1;background:#FFFFFF;}',
    ].join('');
    document.head.appendChild(el);
  }, []);
  return null;
}

function I18nBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initI18n();
  }, []);

  return <>{children}</>;
}

/** Homepage keeps the static LCP shell until LandingPage paints; all other public routes dismiss immediately. */
function PublicWebLcpShell() {
  const pathname = usePathname();

  useEffect(() => {
    const isHome = !pathname || pathname === '/';
    if (!isHome) {
      dismissLcpShell();
    }
  }, [pathname]);

  return null;
}

function NavigationShell() {
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const segments = useSegments();
  const router = useRouter();
  const role = getUserRole(profile);

  useEffect(() => {
    if (loading) return;

    const root = segments[0];
    const inApp = root === '(app)';
    const inDriver = root === '(driver)';

    let target: string | null = null;

    if (userId && !role && (inApp || inDriver)) {
      target = '/';
    }

    if (target && !isCurrentRoute(segments, target)) {
      router.replace(target);
    }
  }, [loading, userId, role, segments, router]);

  return (
    <View style={styles.shell}>
      <Slot />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : null}
    </View>
  );
}

/** Web root: AuthProvider required for useAuth on index, (app), (driver), and (auth) routes. */
export default function RootLayoutWeb() {
  return (
    <SafeAreaProvider>
      <I18nBootstrap>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <ErrorBoundary>
              <WebRootStyles />
              <PublicWebLcpShell />
              <StatusBar style="light" />
              <NavigationShell />
            </ErrorBoundary>
          </AuthProvider>
        </I18nextProvider>
      </I18nBootstrap>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.background,
    minHeight: '100vh' as DimensionValue,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    minHeight: '100vh' as DimensionValue,
  },
});
