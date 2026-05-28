import { Image, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { LANDING } from './landingTheme';

import { BRAND_LOGO } from '../../lib/brandLogo';

export function KekeLogoBadge({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: LANDING.white,
        borderWidth: 2,
        borderColor: LANDING.accent,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image source={BRAND_LOGO} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" />
    </View>
  );
}

export function IllustrationCompany() {
  return (
    <Svg width={320} height={200} viewBox="0 0 320 200">
      <Rect x="80" y="40" width="160" height="120" rx="8" fill={LANDING.text} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <Rect
            key={`${row}-${col}`}
            x={100 + col * 44}
            y={60 + row * 26}
            width="32"
            height="18"
            rx="2"
            fill={LANDING.accentLight}
          />
        )),
      )}
      <Circle cx="248" cy="52" r="18" fill={LANDING.accent} />
      <Path d="M240 52 L246 58 L258 46" stroke={LANDING.text} strokeWidth="3" fill="none" />
    </Svg>
  );
}

export function IllustrationGuide() {
  return (
    <Svg width={320} height={200} viewBox="0 0 320 200">
      <Rect x="60" y="110" width="200" height="50" rx="12" fill={LANDING.text} />
      <Circle cx="90" cy="130" r="16" fill={LANDING.accentLight} />
      <Circle cx="230" cy="130" r="16" fill={LANDING.accentLight} />
      <Path d="M130 70 Q160 40 190 70 L200 95 L120 95 Z" fill={LANDING.accent} />
      <Rect x="148" y="95" width="24" height="30" rx="4" fill={LANDING.text} />
      <Circle cx="160" cy="62" r="22" fill={LANDING.text} />
      <Path d="M148 55 L160 48 L172 55" fill={LANDING.accent} />
    </Svg>
  );
}

export function IllustrationHost() {
  return (
    <Svg width={320} height={200} viewBox="0 0 320 200">
      <Rect x="40" y="120" width="90" height="40" rx="8" fill={LANDING.text} />
      <Rect x="190" y="120" width="90" height="40" rx="8" fill={LANDING.text} />
      <Circle cx="85" cy="140" r="10" fill={LANDING.accent} />
      <Circle cx="235" cy="140" r="10" fill={LANDING.accent} />
      <Circle cx="160" cy="70" r="24" fill={LANDING.text} />
      <Path d="M150 95 L160 110 L170 95" fill={LANDING.accent} />
      <Rect x="155" y="78" width="10" height="14" fill={LANDING.accent} />
      <Path d="M140 110 Q160 100 180 110" stroke={LANDING.accent} strokeWidth="3" fill="none" />
    </Svg>
  );
}

export function IllustrationJobSeeker() {
  return (
    <Svg width={320} height={200} viewBox="0 0 320 200">
      <Circle cx="160" cy="60" r="26" fill={LANDING.text} />
      <Path d="M130 95 Q160 85 190 95 L200 150 L120 150 Z" fill={LANDING.text} />
      <Rect x="175" y="115" width="50" height="36" rx="6" fill={LANDING.accent} />
      <Rect x="180" y="120" width="40" height="8" rx="2" fill={LANDING.text} opacity="0.3" />
      <Line x1="185" y1="132" x2="215" y2="132" stroke={LANDING.text} strokeWidth="2" opacity="0.3" />
    </Svg>
  );
}

export function IconGps() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Path
        d="M14 2 C9 2 5 6 5 11 C5 17 14 26 14 26 C14 26 23 17 23 11 C23 6 19 2 14 2 Z"
        fill={LANDING.accent}
      />
      <Circle cx="14" cy="11" r="4" fill={LANDING.text} />
    </Svg>
  );
}

export function IconVoucher() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Rect x="5" y="3" width="18" height="22" rx="2" fill={LANDING.text} />
      <Line x1="9" y1="9" x2="19" y2="9" stroke={LANDING.accent} strokeWidth="2" />
      <Line x1="9" y1="14" x2="17" y2="14" stroke={LANDING.accentLight} strokeWidth="2" />
      <Line x1="9" y1="19" x2="15" y2="19" stroke={LANDING.accentLight} strokeWidth="2" />
    </Svg>
  );
}

export function IconChat() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Rect x="2" y="4" width="14" height="10" rx="3" fill={LANDING.text} />
      <Rect x="12" y="12" width="14" height="10" rx="3" fill={LANDING.accent} />
    </Svg>
  );
}

export function IconTour() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Circle cx="6" cy="20" r="3" fill={LANDING.accent} />
      <Circle cx="14" cy="12" r="3" fill={LANDING.accent} />
      <Circle cx="22" cy="6" r="3" fill={LANDING.accent} />
      <Path
        d="M6 20 L14 12 L22 6"
        stroke={LANDING.text}
        strokeWidth="2"
        strokeDasharray="4 3"
        fill="none"
      />
    </Svg>
  );
}

export function IconStar() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Path
        d="M14 3 L17 11 L26 11 L19 16 L22 25 L14 20 L6 25 L9 16 L2 11 L11 11 Z"
        fill={LANDING.accent}
      />
    </Svg>
  );
}

export function IconGlobe() {
  return (
    <Svg width="28" height="28" viewBox="0 0 28 28">
      <Circle cx="14" cy="14" r="11" stroke={LANDING.text} strokeWidth="2" fill="none" />
      <Ellipse cx="14" cy="14" rx="5" ry="11" stroke={LANDING.text} strokeWidth="1.5" fill="none" />
      <Line x1="3" y1="14" x2="25" y2="14" stroke={LANDING.text} strokeWidth="1.5" />
      <Line x1="14" y1="3" x2="14" y2="25" stroke={LANDING.accent} strokeWidth="1.5" />
    </Svg>
  );
}

/** Transfer service — car on road A→B */
export function ServiceTransferIllustration() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Path
        d="M8 58 L72 58"
        stroke={LANDING.text}
        strokeWidth="2"
        strokeDasharray="4 4"
        opacity="0.35"
      />
      <Circle cx="14" cy="58" r="5" fill={LANDING.accent} />
      <Circle cx="66" cy="58" r="5" fill={LANDING.accent} />
      <Path d="M20 58 L58 58" stroke={LANDING.accent} strokeWidth="2" />
      <Rect x="28" y="42" width="24" height="12" rx="4" fill={LANDING.text} />
      <Rect x="32" y="38" width="16" height="8" rx="3" fill={LANDING.accentLight} />
      <Circle cx="34" cy="56" r="3" fill={LANDING.text} />
      <Circle cx="46" cy="56" r="3" fill={LANDING.text} />
      <Path d="M14 52 L20 58" stroke={LANDING.accent} strokeWidth="2" />
      <Path d="M66 52 L60 58" stroke={LANDING.accent} strokeWidth="2" />
    </Svg>
  );
}

/** One-day tour — sun, route stops, car */
export function ServiceOneDayIllustration() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Circle cx="62" cy="18" r="10" fill={LANDING.accent} opacity="0.9" />
      <Path
        d="M16 52 L32 44 L48 48 L64 40"
        stroke={LANDING.text}
        strokeWidth="2"
        strokeDasharray="5 4"
        fill="none"
      />
      <Circle cx="16" cy="52" r="4" fill={LANDING.accent} />
      <Circle cx="32" cy="44" r="4" fill={LANDING.accent} />
      <Circle cx="48" cy="48" r="4" fill={LANDING.accent} />
      <Circle cx="64" cy="40" r="4" fill={LANDING.accent} />
      <Rect x="34" y="46" width="18" height="10" rx="3" fill={LANDING.text} />
      <Circle cx="38" cy="58" r="2.5" fill={LANDING.text} />
      <Circle cx="48" cy="58" r="2.5" fill={LANDING.text} />
    </Svg>
  );
}

/** Multi-day tour — calendar sheets, moon, hotel */
export function ServiceMultiDayIllustration() {
  return (
    <Svg width={80} height={80} viewBox="0 0 80 80">
      <Rect x="22" y="20" width="28" height="32" rx="3" fill={LANDING.white} stroke={LANDING.text} strokeWidth="1.5" />
      <Rect x="26" y="16" width="28" height="32" rx="3" fill={LANDING.accentLight} stroke={LANDING.text} strokeWidth="1.5" />
      <Rect x="30" y="12" width="28" height="32" rx="3" fill={LANDING.white} stroke={LANDING.text} strokeWidth="1.5" />
      <Line x1="34" y1="22" x2="54" y2="22" stroke={LANDING.text} strokeWidth="1.5" />
      <Line x1="34" y1="28" x2="50" y2="28" stroke={LANDING.text} strokeWidth="1.5" />
      <Circle cx="58" cy="22" r="6" fill={LANDING.accent} opacity="0.85" />
      <Rect x="14" y="52" width="14" height="10" rx="2" fill={LANDING.text} />
      <Rect x="18" y="48" width="6" height="6" fill={LANDING.accent} />
      <Path
        d="M52 58 Q64 48 68 58"
        stroke={LANDING.accent}
        strokeWidth="2"
        fill="none"
        strokeDasharray="3 3"
      />
    </Svg>
  );
}
