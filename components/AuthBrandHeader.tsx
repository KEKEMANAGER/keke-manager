import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../constants/theme';
import { sx } from '../lib/sx';
import { AppLogo } from './AppLogo';

type Props = {
  /** Omit for default `auth.tagline`; pass `null` to hide subtitle (logo only). */
  tagline?: string | null;
  style?: ViewStyle;
};

export function AuthBrandHeader({ tagline, style }: Props) {
  const { t } = useTranslation();
  const subtitle = tagline === undefined ? t('auth.tagline') : tagline;

  const inner = (
    <>
      <AppLogo size="auth" />
      {subtitle ? <Text style={styles.tagline}>{subtitle}</Text> : null}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <Link href="/" asChild>
        <Pressable
          style={sx(styles.wrap, styles.wrapWeb, style)}
          accessibilityRole="link"
          accessibilityLabel={t('menu.home')}
        >
          {inner}
        </Pressable>
      </Link>
    );
  }

  return <View style={sx(styles.wrap, style)}>{inner}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  wrapWeb: Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : {},
  tagline: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
