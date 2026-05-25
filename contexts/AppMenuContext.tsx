import { useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_HEADER_BODY_HEIGHT, DRAWER_WIDTH, tabBarMinHeight } from '../constants/layout';
import { SPACING } from '../constants/theme';

type AppMenuContextValue = {
  openDrawer: () => void;
  closeDrawer: (cb?: () => void) => void;
  drawerVisible: boolean;
  drawerAnim: Animated.Value;
  backdropAnim: Animated.Value;
  headerVisible: boolean;
  /** Top padding for scroll content when global header is shown. */
  contentPaddingTop: number;
};

const AppMenuContext = createContext<AppMenuContextValue | null>(null);

export function AppMenuProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1];
  const headerVisible = lastSegment !== 'chat';

  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  /** Applied via tab `sceneStyle` in layouts — screens add only SPACING below header. */
  const contentPaddingTop = headerVisible
    ? insets.top + APP_HEADER_BODY_HEIGHT + 8
    : 0;

  const openDrawer = useCallback(() => {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [backdropAnim, drawerAnim]);

  const closeDrawer = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(drawerAnim, { toValue: DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setDrawerVisible(false);
        cb?.();
      });
    },
    [backdropAnim, drawerAnim],
  );

  const value = useMemo(
    () => ({
      openDrawer,
      closeDrawer,
      drawerVisible,
      drawerAnim,
      backdropAnim,
      headerVisible,
      contentPaddingTop,
    }),
    [
      openDrawer,
      closeDrawer,
      drawerVisible,
      drawerAnim,
      backdropAnim,
      headerVisible,
      contentPaddingTop,
    ],
  );

  return <AppMenuContext.Provider value={value}>{children}</AppMenuContext.Provider>;
}

export function useAppMenu() {
  const ctx = useContext(AppMenuContext);
  if (!ctx) {
    throw new Error('useAppMenu must be used within AppMenuProvider');
  }
  return ctx;
}

export function useAppLayoutInsets() {
  const insets = useSafeAreaInsets();
  const { contentPaddingTop, headerVisible } = useAppMenu();
  const tabH = tabBarMinHeight(insets.bottom);
  return {
    paddingTop: SPACING.md,
    paddingBottom: tabH + 16,
    scenePaddingTop: contentPaddingTop,
    tabBarHeight: tabH,
    headerVisible,
    safeBottom: Math.max(insets.bottom, 16),
  };
}
