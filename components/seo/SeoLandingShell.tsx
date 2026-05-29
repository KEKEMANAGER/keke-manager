import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_LOGO } from '../../lib/brandLogo';
import type { SeoLandingLang } from '../../lib/seoLandingPages';
import { LANDING, landingFont, sx } from '../landing/landingTheme';

const INTER_LINK =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';

type Props = {
  children: ReactNode;
  lang: SeoLandingLang;
  onToggleLang: () => void;
};

export function SeoLandingShell({ children, lang, onToggleLang }: Props) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('seo-inter-font')) return;
    const link = document.createElement('link');
    link.id = 'seo-inter-font';
    link.rel = 'stylesheet';
    link.href = INTER_LINK;
    document.head.appendChild(link);
  }, []);

  const otherLabel = lang === 'ka' ? 'EN' : 'ქარ';

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
          <Pressable onPress={onToggleLang} accessibilityRole="button">
            <Text style={styles.langBtn}>{otherLabel}</Text>
          </Pressable>
          <Link href="/sign-up" style={sx(styles.navCta)}>
            <Text style={styles.navCtaText}>{lang === 'ka' ? 'რეგისტრაცია' : 'Sign up'}</Text>
          </Link>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
      <View style={sx(styles.footer, { paddingBottom: insets.bottom + 16 })}>
        <Text style={styles.footerText}>© {new Date().getFullYear()} KEKE Manager · B2B platform · Georgia</Text>
        <View style={styles.footerLinks}>
          <Link href="/" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>{lang === 'ka' ? 'მთავარი' : 'Home'}</Text>
          </Link>
          <Link href="/blog" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>Blog</Text>
          </Link>
          <Link href="/sign-in" style={sx(styles.footerLink)}>
            <Text style={styles.footerLinkText}>{lang === 'ka' ? 'შესვლა' : 'Sign in'}</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}

const interFamily = Platform.select({
  web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  default: 'System',
});

function seoFont(extra?: object) {
  return { fontFamily: interFamily, ...extra };
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
    ...seoFont({ fontSize: 18, fontWeight: '800', color: LANDING.text }),
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navLink: { textDecorationLine: 'none' },
  navText: {
    ...seoFont({ fontSize: 14, fontWeight: '600', color: LANDING.muted }),
  },
  langBtn: {
    ...seoFont({ fontSize: 13, fontWeight: '700', color: LANDING.accent }),
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navCta: {
    backgroundColor: LANDING.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    textDecorationLine: 'none',
  },
  navCtaText: {
    ...seoFont({ fontSize: 13, fontWeight: '800', color: LANDING.text }),
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: LANDING.border,
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    ...seoFont({ fontSize: 12, color: LANDING.muted }),
    textAlign: 'center',
  },
  footerLinks: { flexDirection: 'row', gap: 16 },
  footerLink: { textDecorationLine: 'none' },
  footerLinkText: {
    ...seoFont({ fontSize: 13, fontWeight: '600', color: LANDING.text }),
  },
});
