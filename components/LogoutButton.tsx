import { Ionicons } from '@expo/vector-icons';
import { usePathname, useSegments } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, SPACING } from '../constants/theme';

/** Floating sign-out control — bottom-right, above tab bar when present. */
export function LogoutButton() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const pathname = usePathname();

  const root = segments[0];
  const inAuth = root === '(auth)';
  const inTabs = root === '(app)' || root === '(driver)';
  const onWebLanding =
    Platform.OS === 'web' && (pathname === '/' || pathname === '' || !segments[0]);

  if (!user?.id || inAuth || onWebLanding) return null;

  const bottomOffset = insets.bottom + (inTabs ? 76 : SPACING.lg);

  return (
    <Pressable
      onPress={() => void signOut()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('common.logout')}
      style={({ pressed }) => [
        styles.btn,
        { bottom: bottomOffset, right: SPACING.md },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="log-out-outline" size={17} color={COLORS.textSecondary} />
      <Text style={styles.label}>{t('common.logout')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    zIndex: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.65,
  },
});
