import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View, type ImageStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../AppLogo';
import { APP_HEADER_BODY_HEIGHT, Z_INDEX } from '../../constants/layout';
import { COLORS, SPACING } from '../../constants/theme';
import { useAppMenu } from '../../contexts/AppMenuContext';

export function AppHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { openDrawer, headerVisible } = useAppMenu();

  if (!headerVisible) return null;

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
        <Pressable
          onPress={openDrawer}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('menu.open')}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
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
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  menuBtnPressed: {
    opacity: 0.85,
    backgroundColor: COLORS.surfaceAlt,
  },
});
