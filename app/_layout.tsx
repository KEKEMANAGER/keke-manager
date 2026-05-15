import { Slot, useRouter, useSegments } from 'expo-router';
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
  }, [loading, user?.id, user]);

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
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const root = segments[0];
    const inAuth = root === '(auth)';
    const inApp = root === '(app)';
    const inDriver = root === '(driver)';
    const role = getUserRole(profile);
    const onSignUpRoute = segments.includes('sign-up');

    if (!userId && (inApp || inDriver)) {
      router.replace('/sign-in');
      return;
    }

    if (userId && !role && (inApp || inDriver)) {
      router.replace('/sign-up');
      return;
    }

    if (userId && !role && inAuth && !onSignUpRoute) {
      router.replace('/sign-up');
      return;
    }

    if (userId && inAuth && role) {
      router.replace(role === 'driver' ? '/(driver)/dashboard' : '/(app)/dashboard');
      return;
    }

    if (userId && role === 'driver' && inApp) {
      router.replace('/(driver)/dashboard');
      return;
    }

    if (userId && role === 'company' && inDriver) {
      router.replace('/(app)/dashboard');
      return;
    }

    if (userId && role === 'admin' && inDriver) {
      router.replace('/(app)/dashboard');
      return;
    }
  }, [loading, userId, profile, segments, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Slot />
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
  loading: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    ...Platform.select({
      web: { minHeight: '100vh' as DimensionValue },
      default: {},
    }),
  },
});
