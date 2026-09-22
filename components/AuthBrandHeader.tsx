import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../constants/theme';
import { sx } from '../lib/sx';
import { AppLogo } from './AppLogo';
import { LanguageSwitcher } from './LanguageSwitcher';

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

  // Native only: the very first screen a new app download shows (sign-in),
  // with no in-app language switcher reachable pre-login otherwise. On web
  // the header is itself a Link to "/", so a nested touchable here would
  // fight the outer Pressable for taps — the web landing page has its own
  // language picker instead.
  const languageRow =
    Platform.OS !== 'web' ? (
      <View style={styles.langRow}>
        <LanguageSwitcher />
      </View>
    ) : null;

  if (Platform.OS === 'web') {
    return (
      <View style={sx(styles.wrap, style)}>
        <Link href="/" asChild>
          <Pressable
            style={styles.wrapWeb}
            accessibilityRole="link"
            accessibilityLabel={t('menu.home')}
          >
            {inner}
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <View style={sx(styles.wrap, style)}>
      {languageRow}
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  wrapWeb: Platform.OS === 'web' ? ({ cursor: 'pointer', alignItems: 'center' } as ViewStyle) : { alignItems: 'center' },
  langRow: {
    marginBottom: SPACING.md,
  },
  tagline: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
