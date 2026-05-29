import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AnimatedSplash from '../components/AnimatedSplash';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  PushNotificationListeners,
  PushNotificationRegistration,
} from '../components/PushNotificationRoot';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { getUserRole } from '../lib/role';
import i18n, { initI18n } from '../src/lib/i18n';

function WebRootStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'expo-web-root-layout';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = [
      'html,body{height:100%;margin:0;background:#FFFFFF;}',
      '#root{height:100%;min-height:100%;display:flex;flex:1;background:#FFFFFF;}',
    ].join('');
    document.head.appendChild(el);
  }, []);
  return null;
}

function NavigationShell() {
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const segments = useSegments();
  const pathname = usePathname();
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

    if (target && pathname !== target) {
      router.replace(target);
    }
  }, [loading, userId, role, segments, pathname, router]);

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

function I18nBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void initI18n().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={styles.i18nBoot}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(Platform.OS !== 'web');

  if (showSplash) {
    return <AnimatedSplash onFinish={() => setShowSplash(false)} />;
  }

  return (
    <SafeAreaProvider>
      <I18nBootstrap>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <ErrorBoundary>
              <PushNotificationRegistration />
              <PushNotificationListeners />
              <WebRootStyles />
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
    ...Platform.select({
      web: { minHeight: '100vh' as DimensionValue },
      default: {},
    }),
  },
  i18nBoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    ...Platform.select({
      web: { minHeight: '100vh' as DimensionValue },
      default: {},
    }),
  },
});
