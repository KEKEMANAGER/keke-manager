import { useWindowDimensions } from 'react-native';

export const LANDING_BP = {
  mobileMax: 768,
  tabletMax: 1024,
  containerMax: 1200,
} as const;

export type LandingBreakpoint = 'mobile' | 'tablet' | 'desktop';

export function useLandingBreakpoint() {
  const { width } = useWindowDimensions();
  const isMobile = width < LANDING_BP.mobileMax;
  const isTablet = width >= LANDING_BP.mobileMax && width <= LANDING_BP.tabletMax;
  const isDesktop = width >= LANDING_BP.tabletMax + 1;
  /** width > 768 — tablet + desktop layout (row hero, inline nav links) */
  const isWide = width >= LANDING_BP.mobileMax;
  const bp: LandingBreakpoint = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';
  const containerPadding = isMobile ? 16 : 32;
  return { width, isMobile, isTablet, isDesktop, isWide, bp, containerPadding };
}
