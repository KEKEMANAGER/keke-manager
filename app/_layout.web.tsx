import { Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { type DimensionValue, StyleSheet, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { COLORS } from '../constants/theme';
import { AuthProvider } from '../contexts/AuthContext';
import { dismissLcpShell } from '../lib/lcpShell';
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
              <View style={styles.shell}>
                <Slot />
              </View>
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
});
