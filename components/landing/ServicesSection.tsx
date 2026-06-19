import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { LandingCopy } from '../../lib/landingCopy';
import { LANDING_BP } from './useLandingBreakpoint';
import {
  ServiceMultiDayIllustration,
  ServiceOneDayIllustration,
  ServiceTransferIllustration} from './LandingIllustrations';
import { LANDING, landingFont, sx } from './landingTheme';
import type { ComponentType } from 'react';

type ServiceCardData = {
  key: string;
  Illustration: ComponentType;
  title: string;
  desc: string;
  features: string[];
};

type Props = {
  copy: LandingCopy;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  containerStyle: ViewStyle;
};

function buildCards(copy: LandingCopy): ServiceCardData[] {
  return [
    {
      key: 'transfer',
      Illustration: ServiceTransferIllustration,
      title: copy.serviceTransferTitle,
      desc: copy.serviceTransferDesc,
      features: [
        copy.serviceTransferF1,
        copy.serviceTransferF2,
        copy.serviceTransferF3,
        copy.serviceTransferF4,
      ]},
    {
      key: 'oneDay',
      Illustration: ServiceOneDayIllustration,
      title: copy.serviceOneDayTitle,
      desc: copy.serviceOneDayDesc,
      features: [
        copy.serviceOneDayF1,
        copy.serviceOneDayF2,
        copy.serviceOneDayF3,
        copy.serviceOneDayF4,
      ]},
    {
      key: 'multiDay',
      Illustration: ServiceMultiDayIllustration,
      title: copy.serviceMultiDayTitle,
      desc: copy.serviceMultiDayDesc,
      features: [
        copy.serviceMultiDayF1,
        copy.serviceMultiDayF2,
        copy.serviceMultiDayF3,
        copy.serviceMultiDayF4,
      ]},
  ];
}

export function ServicesSection({ copy, isMobile, isTablet, isDesktop, containerStyle }: Props) {
  const cards = buildCards(copy);
  const sectionPadV = isMobile ? 50 : 76;

  const cardWidthStyle = isDesktop
    ? ({ flexGrow: 1, flexShrink: 1, flexBasis: 320, maxWidth: 380, minWidth: 260 })
    : isTablet
      ? ({ flexGrow: 1, flexShrink: 1, flexBasis: 340, maxWidth: 480, minWidth: 240 })
      : ({ width: '100%' as const, alignSelf: 'stretch' as const });

  return (
    <View nativeID="services" style={sx(styles.section, { paddingVertical: sectionPadV })}>
      <View style={containerStyle}>
        <Text style={sx(styles.label, landingFont({ fontWeight: '600' }))}>{copy.servicesLabel}</Text>
        <Text style={sx(styles.title, landingFont({ fontWeight: '800' }))}>{copy.servicesTitle}</Text>
        <Text style={sx(styles.subtitle, landingFont({ fontWeight: '400' }))}>{copy.servicesSubtitle}</Text>

        <View
          style={sx(
            styles.grid,
            isTablet ? styles.gridTablet : undefined,
            isDesktop ? styles.gridDesktop : undefined,
          )}
        >
          {cards.map((card, index) => {
            const Illu = card.Illustration;
            const centerThirdOnTablet = isTablet && index === 2;
            return (
              <View
                key={card.key}
                style={sx(
                  styles.card,
                  cardWidthStyle,
                  centerThirdOnTablet ? styles.cardTabletCentered : undefined,
                )}
              >
                <View style={styles.illuWrap}>
                  <Illu />
                </View>
                <Text style={sx(styles.cardTitle, landingFont({ fontWeight: '700' }))}>{card.title}</Text>
                <Text style={sx(styles.cardDesc, landingFont({ fontWeight: '400' }))}>{card.desc}</Text>
                <View style={styles.featureList}>
                  {card.features.map((line) => (
                    <View key={line} style={styles.featureRow}>
                      <Text style={styles.check}>✓</Text>
                      <Text style={sx(styles.featureText, landingFont({ fontWeight: '400' }))}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: LANDING.bgSoft,
  },
  label: {
    fontSize: 13,
    color: LANDING.accent,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10},
  title: {
    fontSize: 28,
    color: LANDING.text,
    textAlign: 'center',
    marginBottom: 12},
  subtitle: {
    fontSize: 16,
    lineHeight: 26,
    color: LANDING.muted,
    textAlign: 'center',
    maxWidth: 640,
    alignSelf: 'center',
    marginBottom: 40},
  grid: {
    flexDirection: 'column',
    width: '100%',
    maxWidth: LANDING_BP.containerMax,
    alignSelf: 'center'},
  gridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center'},
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between'},
  card: {
    backgroundColor: LANDING.white,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center'},
  cardTabletCentered: {
    flexBasis: 400,
    maxWidth: 400,
    alignSelf: 'center'},
  illuWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20},
  cardTitle: {
    fontSize: 18,
    color: LANDING.text,
    textAlign: 'center',
    marginBottom: 10},
  cardDesc: {
    fontSize: 13,
    lineHeight: 21,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 20},
  featureList: {
    width: '100%',
    alignSelf: 'stretch'},
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'},
  check: {
    fontSize: 14,
    color: LANDING.accent,
    fontWeight: '700',
    marginTop: 1},
  featureText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#666666'}});
