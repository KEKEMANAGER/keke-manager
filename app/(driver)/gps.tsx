import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DriverTripNavigationButtons } from '../../components/DriverTripNavigationButtons';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  isBackgroundLocationRunning,
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../../lib/backgroundLocation';
import { clearDriverLocation, upsertDriverLocation } from '../../lib/locations';
import { hasTripNavigationTargets, openExternalNavigation, tripNavigationTargets, type TripNavBooking } from '../../lib/openExternalNavigation';
import { supabase } from '../../lib/supabase';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function DriverGpsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ autoStart?: string; bookingId?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const autoStartHandledRef = useRef(false);
  const pickupNavOpenedRef = useRef(false);

  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [tripBooking, setTripBooking] = useState<TripNavBooking | null>(null);

  const bookingId = typeof params.bookingId === 'string' ? params.bookingId.trim() : '';

  useEffect(() => {
    if (!bookingId) {
      setTripBooking(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('bookings')
      .select(
        'from_location, from_location_type, to_location, to_location_type, transfer_in, transfer_out, tour_days',
      )
      .eq('id', bookingId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setTripBooking(data as TripNavBooking);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const stopWatch = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  }, []);

  /** Smooth foreground subscription for the visible map. Background task handles DB upserts when minimized. */
  const attachForegroundWatch = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (watchRef.current) return;
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 10,
      },
      (loc) => {
        const { latitude, longitude } = loc.coords;
        setCurrentLocation({ latitude, longitude });
        if (user?.id) {
          void upsertDriverLocation(user.id, latitude, longitude).then(({ error }) => {
            if (error && __DEV__) console.warn('[gps] upsertDriverLocation:', error.message);
          });
        }
      },
    );
    watchRef.current = sub;
  }, [user?.id]);

  const startTracking = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    if (!user?.id) return false;

    const result = await startBackgroundLocation({
      driverId: user.id,
      bookingId: bookingId || null,
      notificationTitle: t('gpsScreen.bgServiceTitle'),
      notificationBody: t('gpsScreen.bgServiceBody'),
    });

    if (!result.ok) {
      if (result.reason === 'foreground_denied') {
        Alert.alert(t('gpsScreen.bgPermissionDeniedTitle'), t('gpsScreen.bgPermissionDeniedBody'));
      }
      return false;
    }

    if (!result.backgroundGranted) {
      Alert.alert(t('gpsScreen.bgPermissionDeniedTitle'), t('gpsScreen.bgPermissionDeniedBody'));
    }

    setIsTracking(true);
    await attachForegroundWatch();
    return true;
  }, [user?.id, bookingId, t, attachForegroundWatch]);

  /** Restore tracking state if background task is already running (e.g. screen re-mounted mid-trip). */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const running = await isBackgroundLocationRunning();
      if (cancelled) return;
      if (running) {
        setIsTracking(true);
        await attachForegroundWatch();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachForegroundWatch]);

  useEffect(() => {
    if (autoStartHandledRef.current) return;
    if (params.autoStart !== '1') return;
    if (isTracking) return;
    if (Platform.OS === 'web') return;
    autoStartHandledRef.current = true;
    void startTracking();
  }, [params.autoStart, isTracking, startTracking]);

  /** After trip auto-start: open external navigation to pickup (tracking stays in KEKE). */
  useEffect(() => {
    if (params.autoStart !== '1') return;
    if (!isTracking || !tripBooking) return;
    if (pickupNavOpenedRef.current) return;
    const { pickup } = tripNavigationTargets(tripBooking);
    if (!pickup) return;
    pickupNavOpenedRef.current = true;
    void openExternalNavigation(pickup);
  }, [params.autoStart, isTracking, tripBooking]);

  useEffect(() => {
    if (!isTracking || !currentLocation || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion({
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
  }, [isTracking, currentLocation]);

  /** Unmount cleanup: detach the foreground watch only. Leave the background task running. */
  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  async function endTour() {
    stopWatch();
    await stopBackgroundLocation();
    setIsTracking(false);
    if (user?.id) {
      const { error } = await clearDriverLocation(user.id);
      if (error && __DEV__) console.warn('[gps] clearDriverLocation:', error.message);
    }
  }

  const showTripNav = Boolean(tripBooking && hasTripNavigationTargets(tripBooking));

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.screen, styles.webFallback, { paddingTop: insets.top + SPACING.lg }]}>
        <Text style={styles.webTitle}>{t('gpsScreen.title')}</Text>
        <Text style={styles.webBody}>{t('gpsScreen.webBody')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={TBILISI}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {isTracking && currentLocation ? (
          <Marker coordinate={currentLocation} pinColor="blue" title={t('gpsScreen.yourPosition')} />
        ) : null}
      </MapView>

      <View style={[styles.badgeWrap, { top: insets.top + SPACING.sm }]}>
        <View style={[styles.badge, isTracking ? styles.badgeOn : styles.badgeOff]}>
          <Text style={[styles.badgeText, isTracking ? styles.badgeTextOn : styles.badgeTextOff]}>
            {isTracking ? t('gpsScreen.active') : t('gpsScreen.inactive')}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {showTripNav && tripBooking ? (
          <View style={styles.navCard}>
            <View style={styles.navHeader}>
              <Ionicons name="map-outline" size={18} color={COLORS.goldDark} />
              <Text style={styles.navHeaderText}>{t('gpsScreen.externalNavHint')}</Text>
            </View>
            <DriverTripNavigationButtons booking={tripBooking} variant="panel" />
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            if (isTracking) {
              void endTour();
            } else {
              void startTracking();
            }
          }}
          style={({ pressed }) => [
            styles.toggle,
            isTracking ? styles.toggleEnd : styles.toggleStart,
            pressed && styles.togglePressed,
          ]}
        >
          <Text style={[styles.toggleText, isTracking && styles.toggleTextOnRed]}>
            {isTracking ? t('gpsScreen.endTour') : t('gpsScreen.startTour')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webFallback: {
    paddingHorizontal: SPACING.lg,
  },
  webTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  webBody: {
    color: COLORS.grayLight,
    fontSize: 15,
    lineHeight: 22,
  },
  badgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeOn: {
    backgroundColor: 'rgba(46, 204, 113, 0.22)',
    borderColor: 'rgba(46, 204, 113, 0.55)',
  },
  badgeOff: {
    backgroundColor: 'rgba(120, 120, 130, 0.35)',
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  badgeTextOn: {
    color: '#b8f5c8',
  },
  badgeTextOff: {
    color: COLORS.grayLight,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    zIndex: 2,
  },
  navCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  navHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.grayLight,
    lineHeight: 18,
  },
  toggle: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleStart: {
    backgroundColor: COLORS.gold,
  },
  toggleEnd: {
    backgroundColor: COLORS.error,
  },
  togglePressed: {
    opacity: 0.92,
  },
  toggleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f0f0f',
  },
  toggleTextOnRed: {
    color: COLORS.text,
  },
});
