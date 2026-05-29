import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, type DimensionValue, StyleSheet, View } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { COLORS } from '../constants/theme';
import i18n, { initI18n } from '../src/lib/i18n';

function WebRootStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
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

/** Web root: no AuthProvider — public pages avoid Supabase in the initial JS payload. */
export default function RootLayoutWeb() {
  return (
    <SafeAreaProvider>
      <I18nBootstrap>
        <I18nextProvider i18n={i18n}>
          <ErrorBoundary>
            <WebRootStyles />
            <StatusBar style="light" />
            <View style={styles.shell}>
              <Slot />
            </View>
          </ErrorBoundary>
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
  i18nBoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    minHeight: '100vh' as DimensionValue,
  },
});
