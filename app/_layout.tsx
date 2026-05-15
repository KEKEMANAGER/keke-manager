import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  type DimensionValue,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { COLORS } from '../constants/theme';
import { registerForPushNotifications } from '../lib/pushRegistration';
import { getUserRole } from '../lib/role';

function PushNotificationRegistration() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !user?.id) return;
    void registerForPushNotifications(user.id);
  }, [loading, user?.id]);

  return null;
}

function WebRootStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'expo-web-root-layout';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = [
      'html,body{height:100%;margin:0;background:#0f0f0f;}',
      '#root{height:100%;min-height:100%;display:flex;flex:1;background:#0f0f0f;}',
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
    const inAuth = root === '(auth)';
    const inApp = root === '(app)';
    const inDriver = root === '(driver)';
    const onSignUpRoute = segments.includes('sign-up');

    let target: string | null = null;

    if (!userId && (inApp || inDriver)) {
      target = '/sign-in';
    } else if (userId && !role && (inApp || inDriver)) {
      target = '/sign-up';
    } else if (userId && !role && inAuth && !onSignUpRoute) {
      target = '/sign-up';
    } else if (userId && inAuth && role) {
      target = role === 'driver' ? '/(driver)/dashboard' : '/(app)/dashboard';
    } else if (userId && role === 'driver' && inApp) {
      target = '/(driver)/dashboard';
    } else if (userId && (role === 'company' || role === 'admin') && inDriver) {
      target = '/(app)/dashboard';
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushNotificationRegistration />
        <WebRootStyles />
        <StatusBar style="light" />
        <NavigationShell />
      </AuthProvider>
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
