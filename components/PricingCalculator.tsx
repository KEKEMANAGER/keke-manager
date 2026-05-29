import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { fetchRouteDistanceKm, type RouteSegment } from '../lib/osrmRouting';
import {
  calculateRecommendedPrice,
  routeIncludesMountainArea,
  type RecommendedPriceBreakdown,
} from '../lib/pricingCalculator';
import type { VehicleTypeCode } from '../lib/vehicleCatalog';
import { vehicleTypeLabel } from '../lib/vehicleCatalog';

export type PricingCalculatorContext = {
  segments: RouteSegment[];
  locationTexts: string[];
  dayCount: number;
  vehicleType: VehicleTypeCode;
};

type Props = {
  context: PricingCalculatorContext;
  canCalculate: boolean;
  onApplyPrice: (gel: number) => void;
  disabled?: boolean;
};

function formatGel(n: number) {
  return `${n.toLocaleString('ka-GE')} ₾`;
}

export function PricingCalculator({ context, canCalculate, onApplyPrice, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<RecommendedPriceBreakdown | null>(null);

  const runCalculation = useCallback(async () => {
    if (!canCalculate) {
      setErrorKey('pricingCalculator.errorLocations');
      setBreakdown(null);
      return;
    }
    setLoading(true);
    setErrorKey(null);
    setBreakdown(null);
    try {
      const routeRes = await fetchRouteDistanceKm(context.segments);
      if (!routeRes.ok) {
        const key =
          routeRes.error === 'missing_locations'
            ? 'pricingCalculator.errorLocations'
            : routeRes.error === 'geocode_failed'
              ? 'pricingCalculator.errorGeocode'
              : 'pricingCalculator.errorRoute';
        setErrorKey(key);
        return;
      }
      const mountain = routeIncludesMountainArea(context.locationTexts);
      const result = calculateRecommendedPrice({
        distanceKm: routeRes.distanceKm,
        vehicleType: context.vehicleType,
        dayCount: context.dayCount,
        mountainRoute: mountain,
      });
      setBreakdown(result);
    } catch {
      setErrorKey('pricingCalculator.errorRoute');
    } finally {
      setLoading(false);
    }
  }, [canCalculate, context]);

  const openModal = useCallback(() => {
    setOpen(true);
    setErrorKey(null);
    setBreakdown(null);
    void runCalculation();
  }, [runCalculation]);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={openModal}
        style={({ pressed }) => [
          styles.calcBtn,
          disabled && styles.calcBtnDisabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <Text style={styles.calcBtnText}>{t('pricingCalculator.open')}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable
            style={styles.sheet}
            onPress={(e) => {
              if (Platform.OS === 'web') e.stopPropagation?.();
            }}
          >
            <Text style={styles.title}>{t('pricingCalculator.title')}</Text>
            <Text style={styles.meta}>
              {vehicleTypeLabel(context.vehicleType)} ·{' '}
              {t('pricingCalculator.days', { count: context.dayCount })}
            </Text>

            {loading ? (
              <ActivityIndicator color={COLORS.gold} style={styles.loader} />
            ) : errorKey ? (
              <Text style={styles.error}>{t(errorKey)}</Text>
            ) : breakdown ? (
              <View style={styles.resultBlock}>
                <Text style={styles.recommended}>
                  {t('pricingCalculator.recommended', {
                    price: formatGel(breakdown.recommendedGel),
                  })}
                </Text>
                <Text style={styles.detail}>
                  {t('pricingCalculator.distance', { km: breakdown.distanceKm })}
                </Text>
                {breakdown.mountainMultiplier > 1 ? (
                  <Text style={styles.detail}>{t('pricingCalculator.mountain')}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={() => void runCalculation()}
                disabled={loading}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryBtnText}>{t('pricingCalculator.recalculate')}</Text>
              </Pressable>
              {breakdown ? (
                <Pressable
                  onPress={() => {
                    onApplyPrice(breakdown.recommendedGel);
                    closeModal();
                  }}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>{t('pricingCalculator.apply')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={closeModal}
                style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.ghostBtnText}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  calcBtn: {
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  calcBtnDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.88,
  },
  calcBtnText: {
    color: COLORS.goldDark,
    fontWeight: '800',
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  loader: {
    marginVertical: SPACING.lg,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  resultBlock: {
    marginBottom: SPACING.md,
    gap: 6,
  },
  recommended: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.gold,
  },
  detail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  actions: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontWeight: '800',
    color: '#000',
    fontSize: 15,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontWeight: '700',
    color: COLORS.text,
    fontSize: 14,
  },
  ghostBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
