import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

import { BRAND_LOGO } from '../../lib/brandLogo';

type Props = {
  children: ReactNode;
};

export function BlogShell({ children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={sx(styles.header, { paddingTop: insets.top + 12 })}>
        <Link href="/" style={sx(styles.logoLink)}>
          <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
          <Text style={styles.logoText}>KEKE Manager</Text>
        </Link>
        <View style={styles.nav}>
          <Link href="/blog" style={sx(styles.navLink)}>
            <Text style={styles.navText}>Blog</Text>
          </Link>
          <Link href="/sign-up" style={sx(styles.navCta)}>
            <Text style={styles.navCtaText}>Sign up</Text>
          </Link>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      <View style={sx(styles.footer, { paddingBottom: insets.bottom + 16 })}>
        <Text style={styles.footerText}>© {new Date().getFullYear()} KEKE Manager · Georgia</Text>
        <View style={styles.footerLinks}>
          <Link href="/" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>Home</Text>
          </Link>
          <Link href="/blog" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>Blog</Text>
          </Link>
          <Link href="/sign-in" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>Sign in</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LANDING.white,
    ...Platform.select({
      web: { minHeight: '100vh' as const },
      default: {},
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: LANDING.border,
    backgroundColor: LANDING.white,
  },
  logoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    textDecorationLine: 'none',
  },
  logo: { width: 36, height: 36 },
  logoText: {
    ...landingFont({ fontSize: 18, fontWeight: '800', color: LANDING.text }),
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navLink: { textDecorationLine: 'none', padding: 8 },
  navText: {
    ...landingFont({ fontSize: 14, fontWeight: '600', color: LANDING.text }),
  },
  navCta: {
    backgroundColor: LANDING.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    textDecorationLine: 'none',
  },
  navCtaText: {
    ...landingFont({ fontSize: 14, fontWeight: '800', color: LANDING.text }),
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: LANDING.border,
    paddingTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    ...landingFont({ fontSize: 13, color: LANDING.muted }),
  },
  footerLinks: { flexDirection: 'row', gap: 16 },
  footerLink: { textDecorationLine: 'none', padding: 8 },
  footerLinkText: {
    ...landingFont({ fontSize: 13, fontWeight: '600', color: LANDING.accent }),
  },
});
