import { Link } from 'expo-router';
import { useCallback } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import type { LandingCopy } from '../../lib/landingCopy';
import {
  APP_SYNCED_LANDING_LANGS,
  LANGUAGE_SELECTOR_LANGUAGES,
  type LandingLangCode,
} from '../../lib/landingLanguages';
import { persistLanguage, type AppLanguage } from '../../src/lib/i18n';
import { LANDING_BP } from './useLandingBreakpoint';
import { LANDING, landingFont, sx } from './landingTheme';

import { BRAND_LOGO } from '../../lib/brandLogo';

const NAV_LINKS = [
  { id: 'hero', key: 'navHome' as const },
  { id: 'features', key: 'navFeatures' as const },
  { id: 'roles', key: 'navRoles' as const },
  { id: 'contact', key: 'navContact' as const },
] as const;

type Props = {
  copy: LandingCopy;
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  containerStyle: ViewStyle;
  paddingTop: number;
  lang: LandingLangCode;
  langOpen: boolean;
  navOpen: boolean;
  currentLangLabel: string;
  onLangPick: (code: LandingLangCode) => void;
  onNavLink: (id: string) => void;
  onToggleLang: () => void;
  onToggleNav: () => void;
  onCloseMenus: () => void;
};

export function LandingHeader({
  copy,
  width,
  isMobile,
  isTablet,
  containerStyle,
  paddingTop,
  lang,
  langOpen,
  navOpen,
  currentLangLabel,
  onLangPick,
  onNavLink,
  onToggleLang,
  onToggleNav,
  onCloseMenus,
}: Props) {
  const isWide = width >= LANDING_BP.mobileMax;
  const blogHref = lang === 'ka' ? '/blog' : `/blog?lang=${lang}`;

  const handleLangPick = useCallback(
    async (code: LandingLangCode) => {
      onLangPick(code);
      if (APP_SYNCED_LANDING_LANGS.has(code)) {
        await persistLanguage(code as AppLanguage);
      }
    },
    [onLangPick],
  );

  return (
    <View style={styles.nav}>
      <View style={sx(containerStyle, styles.navInner, { paddingTop })}>
        <View style={sx(styles.navRow, isMobile ? styles.navRowMobile : undefined)}>
          <Pressable style={styles.navBrand} onPress={() => onNavLink('hero')}>
            <Image
              source={BRAND_LOGO}
              style={sx(
                styles.navLogo,
                isMobile ? styles.navLogoMobile : isTablet ? styles.navLogoTablet : styles.navLogoDesktop,
              ) as ImageStyle}
              resizeMode="contain"
            />
            {!isMobile ? (
              <Text style={sx(styles.navBrandText, landingFont({ fontWeight: '700' }))}>KEKE MANAGER</Text>
            ) : null}
          </Pressable>

          {isWide ? (
            <View style={styles.navLinks}>
              {NAV_LINKS.map((item) => (
                <Pressable key={item.id} onPress={() => onNavLink(item.id)} style={styles.navLinkItem} hitSlop={8}>
                  <Text
                    style={sx(
                      isTablet ? styles.navLinkTablet : styles.navLink,
                      landingFont({ fontWeight: '500' }),
                    )}
                  >
                    {copy[item.key]}
                  </Text>
                </Pressable>
              ))}
              {Platform.OS === 'web' ? (
                <Link href={blogHref} style={sx(styles.navLinkItem, { textDecorationLine: 'none' })}>
                  <Text style={sx(isTablet ? styles.navLinkTablet : styles.navLink, landingFont({ fontWeight: '500' }))}>
                    Blog
                  </Text>
                </Link>
              ) : null}
            </View>
          ) : null}

          <View style={styles.navSpacer} />

          <View style={sx(styles.navRight, isMobile ? styles.navRightMobile : undefined)}>
            <View style={styles.langWrap}>
              <Pressable style={sx(styles.langBtn, isMobile ? styles.langBtnMobile : undefined)} onPress={onToggleLang}>
                <Text style={sx(styles.langBtnText, landingFont({ fontWeight: '600' }))}>
                  {isMobile ? `🌐 ${currentLangLabel}` : `🌐 ${currentLangLabel} ▾`}
                </Text>
              </Pressable>
              {langOpen ? (
                <View style={sx(styles.langMenu, isMobile ? styles.langMenuMobile : undefined)}>
                  <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                    {LANGUAGE_SELECTOR_LANGUAGES.map((l) => (
                      <Pressable key={l.code} style={styles.langItem} onPress={() => void handleLangPick(l.code)}>
                        <Text
                          style={sx(
                            styles.langItemText,
                            landingFont({ fontWeight: l.code === lang ? '700' : '400' }),
                            l.code === lang ? { color: LANDING.accent } : undefined,
                          )}
                        >
                          {l.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {isMobile ? (
              <Pressable
                style={styles.hamburger}
                onPress={onToggleNav}
                accessibilityRole="button"
                accessibilityLabel="Menu"
              >
                <Text style={styles.hamburgerIcon}>{navOpen ? '✕' : '☰'}</Text>
              </Pressable>
            ) : (
              <>
                <Link href="/sign-in" asChild>
                  <Pressable style={styles.signInBtn}>
                    <Text style={sx(styles.signInText, landingFont({ fontWeight: '600' }))}>{copy.signIn}</Text>
                  </Pressable>
                </Link>
                <Link href="/sign-up" asChild>
                  <Pressable style={sx(styles.signUpBtn, isTablet ? styles.signUpBtnCompact : undefined)}>
                    <Text style={sx(styles.signUpText, landingFont({ fontWeight: '700' }))}>{copy.signUp}</Text>
                  </Pressable>
                </Link>
              </>
            )}
          </View>
        </View>

        {isMobile && navOpen ? (
          <View style={styles.mobileNavDropdown}>
            {NAV_LINKS.map((item) => (
              <Pressable key={item.id} style={styles.mobileNavItem} onPress={() => onNavLink(item.id)}>
                <Text style={sx(styles.mobileNavItemText, landingFont({ fontWeight: '500' }))}>
                  {copy[item.key]}
                </Text>
              </Pressable>
            ))}
            {Platform.OS === 'web' ? (
              <Link href={blogHref} asChild>
                <Pressable style={styles.mobileNavItem} onPress={onCloseMenus}>
                  <Text style={sx(styles.mobileNavItemText, landingFont({ fontWeight: '500' }))}>
                    Blog
                  </Text>
                </Pressable>
              </Link>
            ) : null}
            <View style={styles.mobileNavDivider} />
            <Link href="/sign-in" asChild>
              <Pressable style={styles.mobileNavAuthItem} onPress={onCloseMenus}>
                <Text style={sx(styles.mobileNavAuthText, landingFont({ fontWeight: '600' }))}>{copy.signIn}</Text>
              </Pressable>
            </Link>
            <Link href="/sign-up" asChild>
              <Pressable style={styles.mobileNavSignUp} onPress={onCloseMenus}>
                <Text style={sx(styles.mobileNavSignUpText, landingFont({ fontWeight: '700' }))}>{copy.signUp}</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: LANDING.border,
    overflow: 'visible',
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' as unknown as string },
    }),
  },
  navInner: {
    width: '100%',
    paddingBottom: 10,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  navRowMobile: {
    minHeight: 44,
  },
  navBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  navLogo: { width: 40, height: 40 },
  navLogoTablet: { width: 44, height: 44 },
  navLogoDesktop: { width: 48, height: 48 },
  navLogoMobile: { width: 32, height: 32 },
  navBrandText: {
    fontSize: 15,
    color: LANDING.text,
    letterSpacing: 0.5,
    marginLeft: 10,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 28,
    flexShrink: 0,
  },
  navLinkItem: {
    marginRight: 24,
  },
  navLink: {
    fontSize: 15,
    color: LANDING.text,
  },
  navLinkTablet: {
    fontSize: 14,
    color: LANDING.text,
  },
  navSpacer: {
    flex: 1,
    minWidth: 16,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  navRightMobile: {
    flexShrink: 0,
  },
  hamburger: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LANDING.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LANDING.white,
    zIndex: 220,
  },
  hamburgerIcon: { fontSize: 20, color: LANDING.text },
  mobileNavDropdown: {
    borderTopWidth: 1,
    borderTopColor: LANDING.border,
    paddingVertical: 8,
    marginBottom: 4,
  },
  mobileNavItem: { paddingVertical: 12, paddingHorizontal: 4 },
  mobileNavItemText: { fontSize: 16, color: LANDING.text },
  mobileNavDivider: {
    height: 1,
    backgroundColor: LANDING.border,
    marginVertical: 8,
  },
  mobileNavAuthItem: { paddingVertical: 12, paddingHorizontal: 4 },
  mobileNavAuthText: { fontSize: 16, color: LANDING.text },
  mobileNavSignUp: {
    marginTop: 8,
    backgroundColor: LANDING.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  mobileNavSignUpText: { fontSize: 16, color: LANDING.text },
  langWrap: { position: 'relative', zIndex: 210 },
  langBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LANDING.border,
    marginRight: 8,
  },
  langBtnMobile: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  langBtnText: { fontSize: 12, color: LANDING.text },
  langMenuMobile: { right: 0, top: 38 },
  langMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 120,
    backgroundColor: LANDING.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LANDING.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  langItem: { paddingHorizontal: 12, paddingVertical: 10 },
  langItemText: { fontSize: 13, color: LANDING.text },
  signInBtn: { paddingHorizontal: 10, paddingVertical: 8, marginRight: 4 },
  signInText: { fontSize: 14, color: LANDING.text },
  signUpBtn: {
    backgroundColor: LANDING.text,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  signUpBtnCompact: { paddingHorizontal: 12, paddingVertical: 8 },
  signUpText: { fontSize: 13, color: LANDING.white },
});
