import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blogLangToLandingLang } from '../../lib/blogLandingLang';
import { getLandingCopy } from '../../lib/landingCopy';
import {
  APP_SYNCED_LANDING_LANGS,
  LANDING_LANGUAGES,
  type LandingLangCode,
} from '../../lib/landingLanguages';
import { useLandingLang, persistLandingLang } from '../../lib/useLandingLang';
import { persistLanguage, type AppLanguage } from '../../src/lib/i18n';
import { LandingFooter } from '../landing/LandingFooter';
import { LandingHeader } from '../landing/LandingHeader';
import { LANDING_BP, useLandingBreakpoint } from '../landing/useLandingBreakpoint';
import { LANDING } from '../landing/landingTheme';

type Props = {
  children: ReactNode;
};

function homeHashUrl(sectionId: string, lang: LandingLangCode): string {
  if (sectionId === 'hero') return lang === 'ka' ? '/' : `/?lang=${lang}`;
  return lang === 'ka' ? `/#${sectionId}` : `/?lang=${lang}#${sectionId}`;
}

export function BlogShell({ children }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const landingLang = useLandingLang();
  const { width, isMobile, isTablet, isDesktop, containerPadding } = useLandingBreakpoint();

  const [langOpen, setLangOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const copy = useMemo(() => getLandingCopy(landingLang), [landingLang]);
  const currentLangLabel = LANDING_LANGUAGES.find((l) => l.code === landingLang)?.label ?? 'KA';
  const footerYear = new Date().getFullYear();
  const navBarHeight = isMobile ? 56 : 64;

  const containerStyle = useMemo(
    () => ({
      width: '100%' as const,
      maxWidth: LANDING_BP.containerMax,
      alignSelf: 'center' as const,
      paddingHorizontal: containerPadding,
    }),
    [containerPadding],
  );

  const onLangPick = useCallback(
    async (code: LandingLangCode) => {
      setLangOpen(false);
      await persistLandingLang(code);
      if (code === 'ka') router.setParams({ lang: undefined as unknown as string });
      else router.setParams({ lang: code });
      if (APP_SYNCED_LANDING_LANGS.has(code)) {
        await persistLanguage(code as AppLanguage);
      }
    },
    [router],
  );

  const onNavLink = useCallback(
    (id: string) => {
      setNavOpen(false);
      const href = homeHashUrl(id, landingLang);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(href);
        return;
      }
      router.push(href as never);
    },
    [landingLang, router],
  );

  return (
    <View style={styles.screen}>
      <LandingHeader
        copy={copy}
        width={width}
        isMobile={isMobile}
        isTablet={isTablet}
        containerStyle={containerStyle}
        paddingTop={insets.top + 8}
        lang={landingLang}
        langOpen={langOpen}
        navOpen={navOpen}
        currentLangLabel={currentLangLabel}
        onLangPick={onLangPick}
        onNavLink={onNavLink}
        onToggleLang={() => {
          setLangOpen((o) => !o);
          if (!langOpen) setNavOpen(false);
        }}
        onToggleNav={() => {
          setNavOpen((o) => !o);
          if (!navOpen) setLangOpen(false);
        }}
        onCloseMenus={() => setNavOpen(false)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + navBarHeight + (isMobile && navOpen ? 200 : 12),
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>{children}</View>
        <LandingFooter
          copy={copy}
          containerStyle={containerStyle}
          isMobile={isMobile}
          isDesktop={isDesktop}
          footerYear={footerYear}
        />
      </ScrollView>
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
  } as ViewStyle,
  scroll: { flex: 1, width: '100%' },
  content: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
});
