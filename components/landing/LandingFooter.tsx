import { Link } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LandingCopy } from '../../lib/landingCopy';
import { LANDING, landingFont, sx } from './landingTheme';
import type { ViewStyle } from 'react-native';

type Props = {
  copy: LandingCopy;
  containerStyle: ViewStyle;
  isMobile: boolean;
  isDesktop?: boolean;
  footerYear: number;
  /** Full-width CTA block above footer (landing contact section). */
  showCta?: boolean;
};

export function LandingFooter({
  copy,
  containerStyle,
  isMobile,
  isDesktop = false,
  footerYear,
  showCta = false,
}: Props) {
  return (
    <View style={styles.darkSection}>
      {showCta ? (
        <View style={sx(containerStyle, styles.ctaInner)}>
          <Text
            style={sx(
              styles.ctaTitle,
              landingFont({ fontWeight: '900' }),
              isDesktop ? styles.ctaTitleDesktop : undefined,
            )}
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
      ) : null}

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
  );
}

const styles = StyleSheet.create({
  darkSection: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: LANDING.dark,
    paddingBottom: 32,
    marginTop: 48,
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
