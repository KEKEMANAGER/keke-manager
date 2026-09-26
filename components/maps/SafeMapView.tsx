import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ComponentProps, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { canUseNativeGoogleMaps } from '../../lib/googleMapsConfig';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { MapErrorBoundary } from './MapErrorBoundary';

type MapViewProps = ComponentProps<typeof MapView>;

type Props = MapViewProps & {
  /** Shown when Android Maps API key is missing or MapView fails to render. */
  fallback?: ReactNode;
  /** Extra container style when rendering the unavailable placeholder. */
  fallbackStyle?: StyleProp<ViewStyle>;
};

function DefaultMapFallback({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.fallback}>
      <Ionicons name="map-outline" size={40} color={COLORS.textMuted} />
      <Text style={styles.title}>{t('tracking.mapLoadError')}</Text>
      <Text style={styles.sub}>{t('tracking.mapUnavailable')}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Android-safe MapView: never mounts the native Google Maps view without an API key
 * (avoids hard process crashes that React error boundaries cannot catch).
 */
export const SafeMapView = forwardRef<MapView, Props>(function SafeMapView(
  { fallback, fallbackStyle, style, children, ...rest },
  ref,
) {
  const [epoch, setEpoch] = useState(0);
  const mapsOk = canUseNativeGoogleMaps();

  const placeholder = (
    <View style={[styles.fallbackFill, style as StyleProp<ViewStyle>, fallbackStyle]}>
      {fallback ?? <DefaultMapFallback onRetry={mapsOk ? () => setEpoch((n) => n + 1) : undefined} />}
    </View>
  );

  if (!mapsOk) {
    return placeholder;
  }

  return (
    <MapErrorBoundary
      key={epoch}
      onRetry={() => setEpoch((n) => n + 1)}
      fallback={placeholder}
    >
      <MapView key={`safe-map-${epoch}`} ref={ref} style={style} {...rest}>
        {children}
      </MapView>
    </MapErrorBoundary>
  );
});

const styles = StyleSheet.create({
  fallbackFill: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.goldTint,
  },
  retryText: { color: COLORS.goldDark, fontWeight: '700' },
});
