import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND_DARK = '#0a0a0a';
const BRAND_GOLD = '#EF9F27';
const STEP_COUNT = 6;
const OVERLAY_OPACITY = 0.88;

export type OnboardingTargetRects = {
  newBookingLink?: LayoutRectangle | null;
  menuButton?: LayoutRectangle | null;
  emergencyBtn?: LayoutRectangle | null;
};

type Props = {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
  targets: OnboardingTargetRects;
};

type StepKey = 'welcome' | 'newBooking' | 'drivers' | 'voucher' | 'emergency' | 'done';

const STEP_KEYS: StepKey[] = ['welcome', 'newBooking', 'drivers', 'voucher', 'emergency', 'done'];

function spotlightForStep(step: number, targets: OnboardingTargetRects): LayoutRectangle | null {
  switch (step) {
    case 1:
      return targets.newBookingLink ?? null;
    case 2:
      return targets.menuButton ?? null;
    case 4:
      return targets.emergencyBtn ?? null;
    default:
      return null;
  }
}

function SpotlightMask({
  rect,
  windowW,
  windowH,
}: {
  rect: LayoutRectangle | null;
  windowW: number;
  windowH: number;
}) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return <View style={[StyleSheet.absoluteFill, styles.overlayFill]} />;
  }

  const pad = 8;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const w = Math.min(windowW - x, rect.width + pad * 2);
  const h = Math.min(windowH - y, rect.height + pad * 2);

  return (
    <>
      <View style={[styles.overlayFill, { top: 0, left: 0, right: 0, height: y }]} />
      <View style={[styles.overlayFill, { top: y + h, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.overlayFill, { top: y, left: 0, width: x, height: h }]} />
      <View style={[styles.overlayFill, { top: y, left: x + w, right: 0, height: h }]} />
      <View
        style={[
          styles.spotlightRing,
          { top: y, left: x, width: w, height: h, borderRadius: 12 },
        ]}
      />
    </>
  );
}

export function CompanyOnboardingOverlay({ visible, onComplete, onSkip, targets }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (visible) {
      setStep(0);
      fade.setValue(1);
      slide.setValue(0);
    }
  }, [visible, fade, slide]);

  function animateTo(nextStep: number, onDone?: () => void) {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slide, { toValue: -12, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(nextStep);
      slide.setValue(12);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(onDone);
    });
  }

  function handleSkip() {
    onSkip();
  }

  function handlePrimary() {
    if (step >= STEP_COUNT - 1) {
      onComplete();
      return;
    }
    animateTo(step + 1);
  }

  const stepKey = STEP_KEYS[step] ?? 'welcome';
  const title = t(`companyOnboarding.steps.${stepKey}.title`);
  const body = t(`companyOnboarding.steps.${stepKey}.body`);
  const primaryLabel =
    step === 0 || step === STEP_COUNT - 1
      ? t('companyOnboarding.start')
      : t('companyOnboarding.next');
  const spotlight = spotlightForStep(step, targets);
  const showArrowUp = step === 1 || step === 2;
  const showArrowDown = step === 4;
  const isCentered = step === 0 || step === 3 || step === 5;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleSkip}>
      <View
        style={styles.root}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setWindowSize({ w: width, h: height });
        }}
      >
        <SpotlightMask
          rect={spotlight}
          windowW={windowSize.w}
          windowH={windowSize.h}
        />

        <Animated.View
          style={[
            isCentered ? styles.cardCenter : styles.cardBottom,
            {
              opacity: fade,
              transform: [{ translateY: slide }],
              marginBottom: isCentered ? 0 : insets.bottom + 24,
              marginTop: isCentered ? insets.top + 48 : 0,
            },
          ]}
        >
          {step === 3 ? (
            <View style={styles.voucherIconWrap}>
              <Text style={styles.voucherEmoji}>📄</Text>
            </View>
          ) : null}

          {showArrowUp ? (
            <Text style={styles.arrowHint}>↑</Text>
          ) : null}
          {showArrowDown ? (
            <Text style={styles.arrowHint}>↑</Text>
          ) : null}

          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardBody}>{body}</Text>

          <View style={styles.dotsRow}>
            {STEP_KEYS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={handleSkip} style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}>
              <Text style={styles.skipText}>{t('companyOnboarding.skip')}</Text>
            </Pressable>
            <Pressable
              onPress={handlePrimary}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>

        {step === 2 && targets.menuButton ? (
          <View
            pointerEvents="none"
            style={[
              styles.menuArrow,
              {
                top: targets.menuButton.y + targets.menuButton.height + 4,
                right: Math.max(16, windowSize.w - targets.menuButton.x - targets.menuButton.width),
              },
            ]}
          >
            <Ionicons name="arrow-up" size={28} color={BRAND_GOLD} />
            <Text style={styles.menuArrowText}>{t('companyOnboarding.menuDriversHint')}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlayFill: {
    position: 'absolute',
    backgroundColor: BRAND_DARK,
    opacity: OVERLAY_OPACITY,
  },
  spotlightRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: BRAND_GOLD,
    backgroundColor: 'transparent',
  },
  cardCenter: {
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 24,
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,159,39,0.35)',
    padding: 24,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.45)' as never } : {}),
  },
  cardBottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,159,39,0.35)',
    padding: 22,
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.45)' as never } : {}),
  },
  voucherIconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(239,159,39,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  voucherEmoji: {
    fontSize: 36,
  },
  arrowHint: {
    color: BRAND_GOLD,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  cardBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: BRAND_GOLD,
    width: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipText: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: BRAND_GOLD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: BRAND_DARK,
    fontWeight: '800',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.88,
  },
  menuArrow: {
    position: 'absolute',
    alignItems: 'flex-end',
    maxWidth: 160,
  },
  menuArrowText: {
    color: BRAND_GOLD,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 4,
  },
});
