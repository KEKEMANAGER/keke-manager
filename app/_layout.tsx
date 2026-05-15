import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  type DimensionValue,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LogoutButton } from '../components/LogoutButton';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { COLORS, SPACING } from '../constants/theme';
import {
  configureNotificationHandler,
  ensureAndroidNotificationChannel,
  notificationContentFromRequest,
} from '../lib/notifications';
import { driverProfileMatchesBooking } from '../lib/profiles';
import { registerForPushNotificationsAsync } from '../lib/pushRegistration';
import { getUserRole } from '../lib/role';
import i18n, { initI18n } from '../src/lib/i18n';

if (Platform.OS !== 'web') {
  configureNotificationHandler();
  void ensureAndroidNotificationChannel();
}

function PushNotificationRegistration() {
  const { user, profile, loading } = useAuth();
  const role = getUserRole(profile);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !user?.id) return;
    if (role !== 'driver') return;
    void registerForPushNotificationsAsync(user.id);
  }, [loading, user?.id, role]);

  return null;
}

function PushNotificationListeners() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const router = useRouter();
  const role = getUserRole(profile);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      void (async () => {
        const { title, body } = notificationContentFromRequest(notification);
        const data = notification.request.content.data as
          | {
              type?: string;
              vehicle_type?: string;
              vehicle_class?: string;
              booking_id?: string;
            }
          | undefined;

        if (data?.type === 'new_booking' && role === 'driver' && user?.id) {
          const matches = await driverProfileMatchesBooking(
            user.id,
            data.vehicle_type ?? '',
            data.vehicle_class ?? '',
          );
          if (!matches) return;
        }

        const isBooking =
          data?.type === 'new_booking' ||
          data?.type === 'booking_confirmed' ||
          !data?.type;

        if (!isBooking) return;

        const buttons: { text: string; style?: 'cancel' | 'default'; onPress?: () => void }[] = [
          { text: t('common.close'), style: 'cancel' },
        ];
        if (role === 'driver') {
          buttons.push({
            text: t('notifications.viewBookings'),
            onPress: () => router.push('/(driver)/bookings'),
          });
        }

        Alert.alert(title, body, buttons);
      })();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (role === 'driver' && (data?.type === 'new_booking' || data?.type === 'test')) {
        router.push('/(driver)/bookings');
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [role, router, t, user?.id]);

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
      <GlobalLanguageBar />
      <LogoutButton />
      <Slot />
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : null}
    </View>
  );
}

function GlobalLanguageBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.langBar, { top: insets.top + 4 }]} pointerEvents="box-none">
      <LanguageSwitcher />
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
  return (
    <SafeAreaProvider>
      <I18nBootstrap>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <PushNotificationRegistration />
            <PushNotificationListeners />
            <WebRootStyles />
            <StatusBar style="light" />
            <NavigationShell />
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
  langBar: {
    position: 'absolute',
    right: SPACING.sm,
    zIndex: 100,
    paddingHorizontal: 4,
    paddingVertical: 2,
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
