import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  fetchDriverLocation,
  subscribeToDriverLocation,
  type DriverLocationRow,
} from '../../lib/locations';
import { supabase } from '../../lib/supabase';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSecondsAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return '< 5s';
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

export default function CompanyTrackingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { driverId, driverName } = useLocalSearchParams<{ driverId: string; driverName: string }>();
  const mapRef = useRef<MapView | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [location, setLocation] = useState<DriverLocationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const name = driverName?.trim() || t('common.driver');

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    void fetchDriverLocation(driverId).then((row) => {
      setLocation(row);
      setLoading(false);
    });
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return;
    const ch = subscribeToDriverLocation(driverId, (row) => {
      setLocation(row);
    });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [driverId]);

  // Tick to refresh "X seconds ago" label every 5s
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 5000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Animate map to new location
  useEffect(() => {
    if (!location || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      600,
    );
  }, [location]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + SPACING.md }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
        </View>
        <View style={styles.webWrap}>
          <Ionicons name="navigate-circle-outline" size={52} color={COLORS.textMuted} />
          <Text style={styles.webTitle}>{t('tracking.title')}</Text>
          <Text style={styles.webBody}>{t('tracking.webFallback')}</Text>
        </View>
      </View>
    );
  }

  const isActive = !!location;
  const secondsStale = location
    ? Math.floor((Date.now() - new Date(location.updated_at).getTime()) / 1000)
    : null;
  const isStale = secondsStale != null && secondsStale > 60;

  return (
    <View style={styles.screen}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={TBILISI}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {location ? (
          <Marker
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title={name}
          >
            <View style={styles.markerWrap}>
              <View style={[styles.markerDot, isStale && styles.markerDotStale]}>
                <Ionicons name="car" size={16} color={COLORS.white} />
              </View>
              <View style={[styles.markerTail, isStale && styles.markerTailStale]} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Header overlay */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
      </View>

      {/* Status badge */}
      <View style={[styles.badgeWrap, { top: insets.top + 64 }]}>
        {loading ? (
          <View style={[styles.badge, styles.badgeLoading]}>
            <ActivityIndicator size="small" color={COLORS.gold} />
          </View>
        ) : isActive ? (
          <View style={[styles.badge, isStale ? styles.badgeStale : styles.badgeLive]}>
            <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
            <Text style={[styles.badgeText, isStale ? styles.badgeTextStale : styles.badgeTextLive]}>
              {isStale ? t('tracking.weakSignal') : t('tracking.live')}
            </Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeOff]}>
            <View style={styles.dotOff} />
            <Text style={[styles.badgeText, styles.badgeTextOff]}>{t('tracking.noSignal')}</Text>
          </View>
        )}
      </View>

      {/* Info card at bottom */}
      <View style={[styles.infoCard, { paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.infoLabel}>{t('tracking.driver')}</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{name}</Text>
        </View>

        <View style={styles.divider} />

        {location ? (
          <>
            <View style={styles.coordRow}>
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LAT</Text>
                <Text style={styles.coordValue}>{location.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LNG</Text>
                <Text style={styles.coordValue}>{location.longitude.toFixed(6)}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>{t('tracking.lastUpdated')}</Text>
              <Text style={[styles.infoValue, isStale && styles.infoValueStale]}>
                {formatTime(location.updated_at)} ({formatSecondsAgo(location.updated_at)} {t('tracking.ago')})
              </Text>
            </View>
          </>
        ) : !loading ? (
          <View style={styles.noSignalWrap}>
            <Ionicons name="navigate-outline" size={32} color={COLORS.textMuted} />
            <Text style={styles.noSignalText}>{t('tracking.noSignalHint')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 10,
    ...SHADOWS.card,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  badgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeLive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  badgeStale: {
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderColor: 'rgba(245,166,35,0.4)',
  },
  badgeOff: {
    backgroundColor: 'rgba(107,114,128,0.15)',
    borderColor: COLORS.border,
  },
  badgeLoading: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLive: {
    backgroundColor: COLORS.success,
  },
  dotStale: {
    backgroundColor: COLORS.gold,
  },
  dotOff: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textMuted,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeTextLive: {
    color: COLORS.success,
  },
  badgeTextStale: {
    color: COLORS.goldDark,
  },
  badgeTextOff: {
    color: COLORS.textSecondary,
  },
  markerWrap: {
    alignItems: 'center',
  },
  markerDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.card,
  },
  markerDotStale: {
    backgroundColor: COLORS.textMuted,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.gold,
    marginTop: -1,
  },
  markerTailStale: {
    borderTopColor: COLORS.textMuted,
  },
  infoCard: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    ...SHADOWS.cardStrong,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 90,
  },
  infoValue: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  infoValueStale: {
    color: COLORS.goldDark,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  coordRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  coordItem: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  coordValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  noSignalWrap: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  noSignalText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  // Web fallback
  webWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  webBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
