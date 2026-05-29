import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebSessionRedirect } from '../components/WebSessionRedirect';
import { COLORS } from '../constants/theme';

const LandingPage = lazy(() =>
  import('../components/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);

export default function IndexWeb() {
  return (
    <>
      <WebSessionRedirect />
      <Suspense
        fallback={
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.gold} size="large" />
          </View>
        }
      >
        <LandingPage />
      </Suspense>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    minHeight: '100vh',
  },
});
