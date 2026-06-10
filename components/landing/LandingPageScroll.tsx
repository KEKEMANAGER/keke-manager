import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LandingCopy } from '../../lib/landingCopy';
import { LandingFooter } from './LandingFooter';
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

      <View nativeID="contact">
        <LandingFooter
          copy={copy}
          containerStyle={containerStyle}
          isMobile={isMobile}
          isDesktop={isDesktop}
          footerYear={footerYear}
          showCta
        />
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
});
