import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { hydrateBlogManifestFromWeb } from './blog';
import { LANDING } from '../components/landing/landingTheme';

type Ctx = {
  ready: boolean;
  version: number;
};

const BlogManifestContext = createContext<Ctx>({ ready: true, version: 0 });

export function BlogManifestProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(Platform.OS !== 'web');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    hydrateBlogManifestFromWeb().then((updated) => {
      if (cancelled) return;
      if (updated) setVersion((v) => v + 1);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={LANDING.accent} />
      </View>
    );
  }

  return (
    <BlogManifestContext.Provider value={{ ready, version }}>{children}</BlogManifestContext.Provider>
  );
}

export function useBlogManifestReady(): Ctx {
  return useContext(BlogManifestContext);
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? ('100vh' as const) : undefined,
    backgroundColor: LANDING.white,
  },
});
