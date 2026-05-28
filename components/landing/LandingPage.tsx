import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLandingCopy } from '../../lib/landingCopy';
import {
  isSeoLang,
  OG_IMAGE_URL,
  resolveSeoLang,
  SITE_URL,
} from '../../lib/seoMeta';
import {
  APP_SYNCED_LANDING_LANGS,
  LANDING_LANGUAGES,
  type LandingLangCode} from '../../lib/landingLanguages';
import { persistLanguage, type AppLanguage } from '../../src/lib/i18n';
import {
  IconChat,
  IconGlobe,
  IconGps,
  IconStar,
  IconTour,
  IconVoucher,
  IllustrationCompany,
  IllustrationGuide,
  IllustrationHost,
  IllustrationJobSeeker,
  KekeLogoBadge} from './LandingIllustrations';
import { LandingHeader } from './LandingHeader';
import { LandingPageScroll } from './LandingPageScroll';
import { LANDING, landingFont, sx } from './landingTheme';
import { LANDING_BP, useLandingBreakpoint } from './useLandingBreakpoint';

import { BRAND_LOGO } from '../../lib/brandLogo';

const LANDING_RESPONSIVE_CSS = `
.landing-feature-card {
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
@media (max-width: 768px) {
  .landing-nav-bar { min-height: 52px; }
  .landing-hero-block { padding-top: 8px; }
}
@media (min-width: 769px) and (max-width: 1024px) { /* tablet */ }
@media (min-width: 1025px) {
  .landing-feature-card:hover {
    border-color: #EF9F27 !important;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(239, 159, 39, 0.12);
  }
  .landing-service-card {
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .landing-service-card:hover {
    border-color: #EF9F27 !important;
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(239, 159, 39, 0.12);
  }
}
`;

function scrollToSection(id: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function useLandingMeta(copy: ReturnType<typeof getLandingCopy>) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = copy.metaTitle;
    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', copy.metaDescription);
    setMeta('og:title', copy.metaTitle, true);
    setMeta('og:description', copy.metaDescription, true);
    setMeta('og:image', 'https://kekemanager.com/logo.webp', true);
    setMeta('og:url', 'https://kekemanager.com/', true);
    const link = document.querySelector('link[rel="canonical"]') ?? document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', 'https://kekemanager.com/');
    if (!link.parentElement) document.head.appendChild(link);
    if (!document.getElementById('landing-inter-font')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'landing-inter-font';
      fontLink.rel = 'stylesheet';
      fontLink.href =
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap';
      document.head.appendChild(fontLink);
    }
    const styleId = 'landing-responsive-css';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = LANDING_RESPONSIVE_CSS;
      document.head.appendChild(style);
    }
  }, [copy.metaTitle, copy.metaDescription]);
}

type RoleSlide = {
  key: string;
  title: string;
  titleAccent?: string;
  text: string;
  Illustration: ComponentType;
};

export function LandingPage() {
  const insets = useSafeAreaInsets();
  const { width, isMobile, isTablet, isDesktop, isWide, containerPadding } = useLandingBreakpoint();
  const [lang, setLang] = useState<LandingLangCode>('ka');
  const [langOpen, setLangOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const copy = useMemo(() => getLandingCopy(lang), [lang]);

  useLandingMeta(copy);

  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2200, useNativeDriver }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2200, useNativeDriver }),
      ]),
    ).start();
  }, [floatAnim]);

  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  const slides: RoleSlide[] = useMemo(
    () => [
      {
        key: 'company',
        title: copy.roleCompanyTitle,
        text: copy.roleCompanyText,
        Illustration: IllustrationCompany},
      {
        key: 'guide',
        title: copy.roleGuideTitle,
        text: copy.roleGuideText,
        Illustration: IllustrationGuide},
      {
        key: 'host',
        title: copy.roleHostTitle,
        titleAccent: copy.roleHostTitleAccent,
        text: copy.roleHostText,
        Illustration: IllustrationHost},
      {
        key: 'job',
        title: copy.roleJobSeekerTitle,
        text: copy.roleJobSeekerText,
        Illustration: IllustrationJobSeeker},
    ],
    [copy],
  );

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  const onLangPick = useCallback(async (code: LandingLangCode) => {
    setLang(code);
    setLangOpen(false);
    if (APP_SYNCED_LANDING_LANGS.has(code)) {
      await persistLanguage(code as AppLanguage);
    }
  }, []);

  const onNavLink = useCallback((id: string) => {
    setNavOpen(false);
    scrollToSection(id);
  }, []);

  const features = useMemo(
    () => [
      { Icon: IconGps, title: copy.featureGpsTitle, text: copy.featureGpsText },
      { Icon: IconVoucher, title: copy.featureVoucherTitle, text: copy.featureVoucherText },
      { Icon: IconChat, title: copy.featureChatTitle, text: copy.featureChatText },
      { Icon: IconTour, title: copy.featureTourTitle, text: copy.featureTourText },
      { Icon: IconStar, title: copy.featureRatingTitle, text: copy.featureRatingText },
      { Icon: IconGlobe, title: copy.featureLangTitle, text: copy.featureLangText },
    ],
    [copy],
  );

  const currentLangLabel = LANDING_LANGUAGES.find((l) => l.code === lang)?.label ?? 'KA';

  const containerStyle = useMemo(
    () => ({
      width: '100%' as const,
      maxWidth: LANDING_BP.containerMax,
      alignSelf: 'center' as const,
      paddingHorizontal: containerPadding,
    }),
    [containerPadding],
  );

  const footerYear = new Date().getFullYear();
  const heroLogoSize = isDesktop ? 140 : isTablet ? 110 : 90;
  const heroTitleSize = isDesktop ? 60 : isTablet ? 44 : 30;
  const heroTitleLine = isDesktop ? 68 : isTablet ? 52 : 38;
  const navBarHeight = isMobile ? 56 : 64;
  const carouselMaxWidth = isDesktop ? 800 : isTablet ? 600 : undefined;
  const carouselRow = !isMobile;

  const featureCardStyle = useMemo(
    () =>
      isDesktop
        ? { flexGrow: 1, flexShrink: 1, flexBasis: 320, maxWidth: 380, minWidth: 260 }
        : isTablet
          ? { flexGrow: 1, flexShrink: 1, flexBasis: 340, maxWidth: 480, minWidth: 240 }
          : { width: '100%' as const },
    [isDesktop, isTablet],
  );

  const Illu = slides[slide].Illustration;

  return (
    <View style={styles.page}>
      <LandingHeader
        copy={copy}
        width={width}
        isMobile={isMobile}
        isTablet={isTablet}
        containerStyle={containerStyle}
        paddingTop={insets.top + 8}
        lang={lang}
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
        contentContainerStyle={sx(styles.scrollContent, {
          paddingTop: insets.top + navBarHeight + (isMobile && navOpen ? 200 : isMobile ? 12 : 8),
        })}
        showsVerticalScrollIndicator={false}
      >
        <LandingPageScroll
          copy={copy}
          containerStyle={containerStyle}
          isMobile={isMobile}
          isTablet={isTablet}
          isDesktop={isDesktop}
          isWide={isWide}
          carouselMaxWidth={carouselMaxWidth}
          carouselRow={carouselRow}
          featureCardStyle={featureCardStyle}
          features={features}
          slides={slides}
          slide={slide}
          setSlide={setSlide}
          Illu={Illu}
          footerYear={footerYear}
          heroChildren={
            <View style={styles.heroInnerCol}>
              <View style={sx(styles.heroLogoTop, isWide ? styles.heroLogoTopWide : undefined)}>
                <View
                  style={sx(
                    styles.heroBrandBlock,
                    isMobile ? styles.heroBrandBlockMobile : undefined,
                    Platform.OS !== 'web' ? { transform: [{ translateY: floatY }] } : undefined,
                  )}
                >
                  <Image
                    source={BRAND_LOGO}
                    style={{ width: heroLogoSize, height: heroLogoSize, marginBottom: 8 }}
                    resizeMode="contain"
                    {...(Platform.OS === 'web'
                      ? ({ loading: 'lazy' } as { loading?: 'lazy' | 'eager' })
                      : {})}
                  />
                  <Text
                    style={sx(
                      styles.heroKeke,
                      landingFont({ fontWeight: '900' }),
                      isDesktop ? styles.heroKekeDesktop : undefined,
                      isMobile ? styles.heroKekeMobile : undefined,
                    )}
                  >
                    KEKE
                  </Text>
                  <Text
                    style={sx(
                      styles.heroManager,
                      landingFont({ fontWeight: '700' }),
                      isDesktop ? styles.heroManagerDesktop : undefined,
                      isMobile ? styles.heroManagerMobile : undefined,
                    )}
                  >
                    MANAGER
                  </Text>
                </View>
              </View>

              <View style={styles.heroContent}>
                <View style={styles.heroBadge}>
                  <Text style={sx(styles.heroBadgeText, landingFont({ fontWeight: '600' }))}>{copy.heroBadge}</Text>
                </View>
                <Text
                  style={sx(
                    styles.heroTitle,
                    landingFont({ fontWeight: '900' }),
                    {
                      fontSize: heroTitleSize,
                      lineHeight: heroTitleLine,
                      maxWidth: isDesktop ? 900 : isTablet ? 720 : undefined,
                    },
                  )}
                >
                  {copy.heroTitle1}
                  {'\n'}
                  <Text style={styles.heroTitleAccent}>{copy.heroTitle2}</Text>
                </Text>
                <Text
                  style={sx(
                    styles.heroSubtitle,
                    landingFont({ fontWeight: '400' }),
                    { maxWidth: isDesktop ? 720 : isTablet ? 640 : undefined },
                  )}
                >
                  {copy.heroSubtitle}
                </Text>
                <View style={sx(styles.heroBtns, isMobile ? styles.heroBtnsMobile : undefined)}>
                  <Link href="/sign-up" asChild>
                    <Pressable style={sx(styles.heroPrimary, isMobile ? styles.heroBtnFull : undefined)}>
                      <Text style={sx(styles.heroPrimaryText, landingFont({ fontWeight: '700' }))}>
                        {copy.heroCtaPrimary}
                      </Text>
                    </Pressable>
                  </Link>
                  <Pressable
                    style={sx(styles.heroSecondary, isMobile ? styles.heroBtnFull : undefined)}
                    onPress={() => scrollToSection('roles')}
                  >
                    <Text style={sx(styles.heroSecondaryText, landingFont({ fontWeight: '600' }))}>
                      {copy.heroCtaSecondary}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: LANDING.white,
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' as unknown as string } as object) : {}),
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: {
    width: '100%',
    alignItems: 'stretch',
  },
  heroInnerCol: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  heroLogoTop: {
    width: '100%',
    alignItems: 'center',
  },
  heroLogoTopWide: {
    marginBottom: 36,
  },
  heroBrandBlock: {
    alignItems: 'center',
  },
  heroBrandBlockMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroContent: {
    width: '100%',
    alignItems: 'center',
  },
  heroGlow: {
    position: 'absolute',
    top: -80,
    left: '10%',
    right: '10%',
    maxWidth: 700,
    height: 400,
    borderRadius: 300,
    backgroundColor: LANDING.accent,
    opacity: 0.12,
    alignSelf: 'center'},
  heroKeke: { fontSize: 40, color: LANDING.text, letterSpacing: 2 },
  heroKekeDesktop: { fontSize: 52, letterSpacing: 4 },
  heroKekeMobile: { fontSize: 34, letterSpacing: 2 },
  heroManager: { fontSize: 16, color: LANDING.text, letterSpacing: 6, marginTop: -4 },
  heroManagerDesktop: { fontSize: 20, letterSpacing: 10 },
  heroManagerMobile: { fontSize: 13, letterSpacing: 5, marginTop: 0 },
  heroBadge: {
    marginTop: 20,
    backgroundColor: LANDING.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center'},
  heroBadgeText: { fontSize: 13, color: LANDING.text },
  heroTitle: {
    marginTop: 20,
    color: LANDING.text,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%'},
  heroTitleAccent: { color: LANDING.accent },
  heroSubtitle: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 26,
    color: LANDING.muted,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%'},
  heroBtns: {
    flexDirection: 'row',
    marginTop: 28,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center'},
  heroBtnsMobile: { flexDirection: 'column', width: '100%' },
  heroBtnFull: { width: '100%', minWidth: undefined },
  heroPrimary: {
    backgroundColor: LANDING.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center'},
  heroPrimaryText: { fontSize: 16, color: LANDING.text },
  heroSecondary: {
    borderWidth: 2,
    borderColor: LANDING.text,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    backgroundColor: LANDING.white},
  heroSecondaryText: { fontSize: 15, color: LANDING.text },
  rolesSection: { backgroundColor: LANDING.bgSoft, paddingVertical: 56 },
  sectionTitle: {
    fontSize: 28,
    color: LANDING.text,
    textAlign: 'center',
    marginBottom: 28},
  carouselOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'},
  carouselArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LANDING.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LANDING.border,
    flexShrink: 0},
  carouselArrowText: { fontSize: 26, color: LANDING.text, marginTop: -2 },
  carouselCard: {
    flex: 1,
    width: '100%',
    backgroundColor: LANDING.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: LANDING.border,
    alignSelf: 'center'},
  carouselCardMobile: { padding: 16 },
  carouselInner: { width: '100%' },
  carouselInnerRow: { flexDirection: 'row', alignItems: 'center'},
  carouselIllu: {
    height: 200,
    backgroundColor: LANDING.accentLight,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative'},
  carouselIlluRow: {
    flex: 1,
    minHeight: 220,
    marginBottom: 0},
  carouselIlluMobile: {
    width: '100%',
    marginBottom: 16},
  carouselBody: { flex: 1 },
  carouselBodyRow: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  carouselTitle: { fontSize: 20, color: LANDING.text, marginBottom: 8 },
  carouselTitleAccent: { color: LANDING.accent },
  carouselText: { fontSize: 15, lineHeight: 24, color: LANDING.muted },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LANDING.border },
  dotActive: { backgroundColor: LANDING.accent, width: 24 },
  featuresSection: { paddingVertical: 56, backgroundColor: LANDING.white },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    justifyContent: 'space-between'},
  featureCard: {
    borderWidth: 1,
    borderColor: LANDING.border,
    borderRadius: 14,
    padding: 20,
    backgroundColor: LANDING.white,
    minWidth: 240},
  featureIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: LANDING.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12},
  featureTitle: { fontSize: 17, color: LANDING.text, marginBottom: 6 },
  featureText: { fontSize: 14, lineHeight: 22, color: LANDING.muted },
  ctaSection: {
    paddingVertical: 64,
    backgroundColor: LANDING.dark},
  ctaInner: { alignItems: 'center' },
  ctaTitle: { fontSize: 28, color: LANDING.white, textAlign: 'center' },
  ctaTitleDesktop: { fontSize: 40 },
  ctaTitleAccent: { color: LANDING.accent },
  ctaSubtitle: {
    marginTop: 12,
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    maxWidth: 520,
    lineHeight: 24},
  ctaBtn: {
    marginTop: 24,
    backgroundColor: LANDING.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12},
  ctaBtnText: { fontSize: 16, color: LANDING.text },
  footer: {
    backgroundColor: LANDING.dark,
    paddingTop: 48,
    paddingBottom: 32},
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'},
  footerRowMobile: { flexDirection: 'column'},
  footerLeft: { flex: 1 },
  footerRight: { flex: 1 },
  footerRightMobile: { marginTop: 0 },
  footerBrand: { fontSize: 22, color: LANDING.white, marginBottom: 8 },
  footerTag: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 16 },
  footerPerson: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  footerContactTitle: { fontSize: 16, color: LANDING.white, marginBottom: 10 },
  footerLink: { fontSize: 15, color: LANDING.accent, marginBottom: 8 },
  footerMuted: { fontSize: 14, color: 'rgba(255,255,255,0.55)' },
  footerBottom: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'},
  footerBottomMobile: { flexDirection: 'column', alignItems: 'flex-start' },
  footerBottomText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerLegal: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  footerLegalLink: { fontSize: 13, color: LANDING.accent },
  footerDot: { color: 'rgba(255,255,255,0.4)' }});
