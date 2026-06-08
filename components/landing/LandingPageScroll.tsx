import { Link } from 'expo-router';
import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LandingCopy } from '../../lib/landingCopy';
import { ServicesSection } from './ServicesSection';
import { KekeLogoBadge } from './LandingIllustrations';
import { LANDING, landingFont, sx } from './landingTheme';
import type { ViewStyle } from 'react-native';

type RoleSlide = {
  key: string;
  title: string;
  titleAccent?: string;
  text: string;
  Illustration: ComponentType;
};

type Feature = { Icon: ComponentType; title: string; text: string };

type Props = {
  copy: LandingCopy;
  containerStyle: ViewStyle;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  carouselMaxWidth: number | undefined;
  carouselRow: boolean;
  featureCardStyle: ViewStyle;
  features: Feature[];
  slides: RoleSlide[];
  slide: number;
  setSlide: Dispatch<SetStateAction<number>>;
  Illu: ComponentType;
  footerYear: number;
  heroChildren: ReactNode;
};

export function LandingPageScroll({
  copy,
  containerStyle,
  isMobile,
  isTablet,
  isDesktop,
  isWide,
  carouselMaxWidth,
  carouselRow,
  featureCardStyle,
  features,
  slides,
  slide,
  setSlide,
  Illu,
  footerYear,
  heroChildren,
}: Props) {
  return (
    <>
      <View nativeID="hero" style={sx(styles.sectionBand, styles.hero, isWide ? styles.heroWide : undefined)}>
        <View style={containerStyle}>{heroChildren}</View>
      </View>

      <View nativeID="roles" style={sx(styles.sectionBand, styles.rolesSection)}>
        <View style={containerStyle}>
          <Text style={sx(styles.sectionTitle, landingFont({ fontWeight: '800' }))}>{copy.rolesTitle}</Text>
          <View style={styles.carouselOuter}>
            <Pressable style={styles.carouselArrow} onPress={() => setSlide((s) => (s - 1 + slides.length) % slides.length)}>
              <Text style={styles.carouselArrowText}>‹</Text>
            </Pressable>
            <View
              style={sx(
                styles.carouselCard,
                carouselMaxWidth != null ? { maxWidth: carouselMaxWidth } : undefined,
                isMobile ? styles.carouselCardMobile : undefined,
              )}
            >
              <View style={sx(styles.carouselInner, carouselRow ? styles.carouselInnerRow : undefined)}>
                <View
                  style={sx(
                    styles.carouselIllu,
                    carouselRow ? styles.carouselIlluRow : undefined,
                    isMobile ? styles.carouselIlluMobile : undefined,
                  )}
                >
                  <Illu />
                  <KekeLogoBadge />
                </View>
                <View style={sx(styles.carouselBody, carouselRow ? styles.carouselBodyRow : undefined)}>
                  <Text style={sx(styles.carouselTitle, landingFont({ fontWeight: '700' }))}>
                    {slides[slide].title}
                    {slides[slide].titleAccent ? (
                      <Text style={styles.carouselTitleAccent}> {slides[slide].titleAccent}</Text>
                    ) : null}
                  </Text>
                  <Text style={sx(styles.carouselText, landingFont({ fontWeight: '400' }))}>{slides[slide].text}</Text>
                </View>
              </View>
            </View>
            <Pressable style={styles.carouselArrow} onPress={() => setSlide((s) => (s + 1) % slides.length)}>
              <Text style={styles.carouselArrowText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.dots}>
            {slides.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => setSlide(i)}
                style={sx(styles.dot, i === slide ? styles.dotActive : undefined)}
              />
            ))}
          </View>
        </View>
      </View>

      <ServicesSection
        copy={copy}
        isMobile={isMobile}
        isTablet={isTablet}
        isDesktop={isDesktop}
        containerStyle={containerStyle}
      />

      <View nativeID="features" style={sx(styles.sectionBand, styles.featuresSection)}>
        <View style={containerStyle}>
          <Text style={sx(styles.sectionTitle, landingFont({ fontWeight: '800' }))}>{copy.featuresTitle}</Text>
          <View style={styles.featureGrid}>
            {features.map((f) => (
              <View key={f.title} style={sx(styles.featureCard, featureCardStyle)}>
                <View style={styles.featureIconWrap}>
                  <f.Icon />
                </View>
                <Text style={sx(styles.featureTitle, landingFont({ fontWeight: '700' }))}>{f.title}</Text>
                <Text style={sx(styles.featureText, landingFont({ fontWeight: '400' }))}>{f.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View nativeID="contact" style={styles.darkSection}>
        <View style={sx(containerStyle, styles.ctaInner)}>
          <Text
            style={sx(styles.ctaTitle, landingFont({ fontWeight: '900' }), isDesktop ? styles.ctaTitleDesktop : undefined)}
          >
            {copy.ctaTitle1} <Text style={styles.ctaTitleAccent}>{copy.ctaTitle2}</Text>
          </Text>
          <Text style={sx(styles.ctaSubtitle, landingFont({ fontWeight: '400' }))}>{copy.ctaSubtitle}</Text>
          <Link href="/sign-up" asChild>
            <Pressable style={styles.ctaBtn}>
              <Text style={sx(styles.ctaBtnText, landingFont({ fontWeight: '700' }))}>{copy.ctaButton}</Text>
            </Pressable>
          </Link>
        </View>

        <View style={containerStyle}>
          <View style={sx(styles.footerRow, isMobile ? styles.footerRowMobile : undefined)}>
            <View style={styles.footerLeft}>
              <Text style={sx(styles.footerBrand, landingFont({ fontWeight: '900' }))}>KEKE MANAGER</Text>
              <Text style={sx(styles.footerTag, landingFont({ fontWeight: '400' }))}>{copy.footerTagline}</Text>
              <Text style={sx(styles.footerPerson, landingFont({ fontWeight: '500' }))}>{copy.footerCeo}</Text>
              <Text style={sx(styles.footerPerson, landingFont({ fontWeight: '500' }))}>{copy.footerCofounder}</Text>
            </View>
            <View style={sx(styles.footerRight, isMobile ? styles.footerRightMobile : undefined)}>
              <Text style={sx(styles.footerContactTitle, landingFont({ fontWeight: '700' }))}>{copy.footerContact}</Text>
              <Pressable onPress={() => void Linking.openURL('mailto:info@kekemanager.com')}>
                <Text style={sx(styles.footerLink, landingFont({ fontWeight: '600' }))}>info@kekemanager.com</Text>
              </Pressable>
              <Pressable onPress={() => void Linking.openURL('tel:+995551003411')}>
                <Text style={sx(styles.footerLink, landingFont({ fontWeight: '600' }))}>+995 551 003 411</Text>
              </Pressable>
              <Text style={sx(styles.footerMuted, landingFont({ fontWeight: '400' }))}>Tbilisi, Georgia</Text>
            </View>
          </View>
          <View style={sx(styles.footerBottom, isMobile ? styles.footerBottomMobile : undefined)}>
            <Text style={styles.footerBottomText}>
              {copy.footerRights.replace('2025', String(footerYear))}
            </Text>
            <View style={styles.footerLegal}>
              <Link href="/legal/privacy-policy" asChild>
                <Pressable>
                  <Text style={sx(styles.footerLegalLink, landingFont({ fontWeight: '500' }))}>{copy.footerPrivacy}</Text>
                </Pressable>
              </Link>
              <Text style={styles.footerDot}> · </Text>
              <Link href="/legal/terms-of-service" asChild>
                <Pressable>
                  <Text style={sx(styles.footerLegalLink, landingFont({ fontWeight: '500' }))}>{copy.footerTerms}</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionBand: {
    width: '100%',
    alignSelf: 'stretch',
  },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 64, overflow: 'hidden' },
  heroWide: {
    alignItems: 'stretch',
    paddingTop: 48,
    paddingBottom: 80,
  },
  rolesSection: { backgroundColor: LANDING.bgSoft, paddingVertical: 56 },
  sectionTitle: { fontSize: 28, color: LANDING.text, textAlign: 'center', marginBottom: 28 },
  carouselOuter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  carouselArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LANDING.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LANDING.border,
    flexShrink: 0,
  },
  carouselArrowText: { fontSize: 26, color: LANDING.text, marginTop: -2 },
  carouselCard: {
    flex: 1,
    width: '100%',
    backgroundColor: LANDING.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: LANDING.border,
    alignSelf: 'center',
  },
  carouselCardMobile: { padding: 16 },
  carouselInner: { width: '100%' },
  carouselInnerRow: { flexDirection: 'row', alignItems: 'center' },
  carouselIllu: {
    height: 200,
    backgroundColor: LANDING.accentLight,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  carouselIlluRow: { flex: 1, minHeight: 220, marginBottom: 0 },
  carouselIlluMobile: { width: '100%', marginBottom: 16 },
  carouselBody: { flex: 1 },
  carouselBodyRow: { flex: 1, justifyContent: 'center', paddingVertical: 8 },
  carouselTitle: { fontSize: 20, color: LANDING.text, marginBottom: 8 },
  carouselTitleAccent: { color: LANDING.accent },
  carouselText: { fontSize: 15, lineHeight: 24, color: LANDING.muted },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LANDING.border, marginHorizontal: 4 },
  dotActive: { backgroundColor: LANDING.accent, width: 24 },
  featuresSection: { paddingVertical: 56, backgroundColor: LANDING.white },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' },
  featureCard: {
    borderWidth: 1,
    borderColor: LANDING.border,
    borderRadius: 14,
    padding: 20,
    backgroundColor: LANDING.white,
    minWidth: 240,
    marginBottom: 16,
  },
  featureIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: LANDING.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: { fontSize: 17, color: LANDING.text, marginBottom: 6 },
  featureText: { fontSize: 14, lineHeight: 22, color: LANDING.muted },
  darkSection: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: LANDING.dark,
    paddingBottom: 32,
  },
  ctaInner: { alignItems: 'center', paddingTop: 64, paddingBottom: 48 },
  ctaTitle: { fontSize: 28, color: LANDING.white, textAlign: 'center' },
  ctaTitleDesktop: { fontSize: 40 },
  ctaTitleAccent: { color: LANDING.accent },
  ctaSubtitle: {
    marginTop: 12,
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    maxWidth: 520,
    lineHeight: 24,
  },
  ctaBtn: {
    marginTop: 24,
    backgroundColor: LANDING.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaBtnText: { fontSize: 16, color: LANDING.text },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  footerRowMobile: { flexDirection: 'column' },
  footerLeft: { flex: 1 },
  footerRight: { flex: 1 },
  footerRightMobile: { marginTop: 24 },
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
    width: '100%',
  },
  footerBottomMobile: { flexDirection: 'column', alignItems: 'flex-start' },
  footerBottomText: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  footerLegal: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  footerLegalLink: { fontSize: 13, color: LANDING.accent },
  footerDot: { color: 'rgba(255,255,255,0.4)' },
});
