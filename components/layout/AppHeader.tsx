import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type ImageStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../AppLogo';
import { APP_HEADER_BODY_HEIGHT, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useAppMenu } from '../../contexts/AppMenuContext';
import { getAppHomeRoute, isAppHomeSegment } from '../../lib/appHome';

export function AppHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { menuRole } = useAuth();
  const { openDrawer, headerVisible } = useAppMenu();

  const lastSegment = segments[segments.length - 1];
  const homeRoute = menuRole ? getAppHomeRoute(menuRole) : null;
  const onHome = homeRoute && !isAppHomeSegment(menuRole, lastSegment);

  if (!headerVisible) return null;

  function goHome() {
    if (!homeRoute) return;
    router.replace(homeRoute as never);
  }

  return (
    <View
      style={[
        styles.wrap,
        Platform.OS === 'web' ? styles.wrapWeb : null,
        {
          paddingTop: insets.top,
          height: insets.top + APP_HEADER_BODY_HEIGHT,
        },
      ]}
    >
      <View style={styles.row}>
        <AppLogo size="header" style={styles.logoImage} />
        <Text style={styles.title} numberOfLines={1}>
          {t('menu.appTitle')}
        </Text>
        {onHome ? (
          <Pressable
            onPress={goHome}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('menu.home')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Ionicons name="home-outline" size={22} color={COLORS.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={openDrawer}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('menu.open')}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
        >
          <Ionicons name="menu-outline" size={22} color={COLORS.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: Z_INDEX.header,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wrapWeb: Platform.OS === 'web' ? ({ position: 'fixed' } as unknown as ViewStyle) : {},
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    minHeight: APP_HEADER_BODY_HEIGHT,
  },
  logoImage: {
    width: 40,
    height: 40,
    marginRight: 0,
  } satisfies ImageStyle,
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    opacity: 0.85,
    backgroundColor: COLORS.surfaceAlt,
  },
});
