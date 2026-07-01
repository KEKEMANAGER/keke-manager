import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DriverTripNavigationButtons } from '../../components/DriverTripNavigationButtons';
import { BackgroundLocationDisclosureModal } from '../../components/BackgroundLocationDisclosureModal';
import { MapErrorBoundary } from '../../components/maps/MapErrorBoundary';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  isBackgroundLocationRunning,
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../../lib/backgroundLocation';
import {
  completeBooking,
  isTourBookingKind,
  type BookingRow,
} from '../../lib/bookings';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { clearDriverLocation, upsertDriverLocation } from '../../lib/locations';
import { hasTripNavigationTargets, openExternalNavigation, tripNavigationTargets, type TripNavBooking } from '../../lib/openExternalNavigation';
import { supabase } from '../../lib/supabase';
import { completeTourTripWithOdometer, odometerErrorMessageKey } from '../../lib/tourTripLifecycle';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const TRIP_BOOKING_SELECT =
  'id, kind, status, from_location, from_location_type, to_location, to_location_type, transfer_in, transfer_out, tour_days';

type TripBookingState = TripNavBooking & Pick<BookingRow, 'id' | 'kind' | 'status'>;

export default function DriverGpsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ autoStart?: string; bookingId?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const autoStartHandledRef = useRef(false);
  const pickupNavOpenedRef = useRef(false);
  const disclosureResolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [tripBooking, setTripBooking] = useState<TripBookingState | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);

  const bookingId = typeof params.bookingId === 'string' ? params.bookingId.trim() : '';

  const refreshTripBooking = useCallback(async (): Promise<TripBookingState | null> => {
    if (!bookingId) {
      setTripBooking(null);
      return null;
    }
    const { data } = await supabase
      .from('bookings')
      .select(TRIP_BOOKING_SELECT)
      .eq('id', bookingId)
      .maybeSingle();
    if (data) {
      const booking = data as TripBookingState;
      setTripBooking(booking);
      return booking;
    }
    setTripBooking(null);
    return null;
  }, [bookingId]);

  useEffect(() => {
    void refreshTripBooking();
  }, [refreshTripBooking]);

  useFocusEffect(
    useCallback(() => {
      void refreshTripBooking();
    }, [refreshTripBooking]),
  );

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
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== 'granted') {
        setLocationDenied(true);
        return;
      }
      setLocationDenied(false);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 10,
        },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          setCurrentLocation({ latitude, longitude });
          if (user?.id) {
            void upsertDriverLocation(user.id, latitude, longitude).then(({ error }) => {
              if (error && __DEV__) console.warn('[gps] upsertDriverLocation:', error.message);
            });
          }
        },
      );
      watchRef.current = sub;
    } catch (e) {
      if (__DEV__) console.warn('[gps] attachForegroundWatch failed:', e);
      setLocationDenied(true);
    }
  }, [user?.id]);

  const promptBackgroundDisclosure = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      disclosureResolverRef.current = resolve;
      setDisclosureVisible(true);
    });
  }, []);

  const resolveDisclosure = useCallback((accepted: boolean) => {
    setDisclosureVisible(false);
    const resolve = disclosureResolverRef.current;
    disclosureResolverRef.current = null;
    resolve?.(accepted);
  }, []);

  /** Show Google Play prominent disclosure before background permission, if not already granted. */
  const ensureBackgroundDisclosure = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status === 'granted') return true;
    } catch (e) {
      if (__DEV__) console.warn('[gps] getBackgroundPermissionsAsync failed:', e);
    }
    return promptBackgroundDisclosure();
  }, [promptBackgroundDisclosure]);

  const startTracking = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    if (!user?.id) return false;

    const backgroundAccepted = await ensureBackgroundDisclosure();

    const result = await startBackgroundLocation({
      driverId: user.id,
      bookingId: bookingId || null,
      notificationTitle: t('gpsScreen.bgServiceTitle'),
      notificationBody: t('gpsScreen.bgServiceBody'),
      requestBackground: backgroundAccepted,
    });

    if (!result.ok) {
      if (result.reason === 'foreground_denied') {
        setLocationDenied(true);
        Alert.alert(t('gpsScreen.bgPermissionDeniedTitle'), t('tracking.locationPermissionDenied'));
      }
      return false;
    }

    if (!result.backgroundGranted && backgroundAccepted) {
      Alert.alert(t('gpsScreen.bgPermissionDeniedTitle'), t('gpsScreen.bgPermissionDeniedBody'));
    }

    setLocationDenied(false);

    setIsTracking(true);
    await attachForegroundWatch();
    return true;
  }, [user?.id, bookingId, t, attachForegroundWatch, ensureBackgroundDisclosure]);

  /** Restore tracking state if background task is already running (e.g. screen re-mounted mid-trip). */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      try {
        const running = await isBackgroundLocationRunning();
        if (cancelled) return;
        if (running) {
          setIsTracking(true);
          await attachForegroundWatch();
        }
      } catch (e) {
        if (__DEV__) console.warn('[gps] restore background tracking failed:', e);
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
    try {
      mapRef.current?.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      });
    } catch (e) {
      if (__DEV__) console.warn('[gps] animateToRegion failed:', e);
    }
  }, [isTracking, currentLocation]);

  /** Unmount cleanup: detach the foreground watch only. Leave the background task running. */
  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  async function stopTracking() {
    stopWatch();
    await stopBackgroundLocation();
    setIsTracking(false);
    if (user?.id) {
      const { error } = await clearDriverLocation(user.id);
      if (error && __DEV__) console.warn('[gps] clearDriverLocation:', error.message);
    }
  }

  function alertStartTripFirst() {
    Alert.alert(t('gpsScreen.completeNeedsInProgressTitle'), t('gpsScreen.startTripFirstHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('gpsScreen.goToBookings'),
        onPress: () => router.push('/(driver)/bookings'),
      },
    ]);
  }

  async function completeActiveBooking(): Promise<boolean> {
    if (!user?.id || !bookingId) {
      return false;
    }

    const fresh = await refreshTripBooking();
    const booking = fresh ?? tripBooking;
    if (!booking?.id) {
      return false;
    }

    const status = String(booking.status ?? '').toLowerCase();
    if (status === 'completed') {
      Alert.alert(t('common.success'), t('gpsScreen.alreadyCompleted'));
      return false;
    }
    if (status === 'accepted' || status === 'confirmed') {
      alertStartTripFirst();
      return false;
    }
    if (status !== 'in_progress') {
      Alert.alert(t('common.error'), t('gpsScreen.completeNeedsInProgress'));
      return false;
    }

    const res = isTourBookingKind(booking.kind)
      ? await completeTourTripWithOdometer(booking as BookingRow, user.id)
      : await completeBooking(booking.id, user.id).then((r) =>
          r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? new Error('complete_failed') },
        );

    if (!res.ok) {
      if ('cancelled' in res && res.cancelled) return false;
      Alert.alert(
        t('common.error'),
        getSupabaseErrorMessage('error' in res ? res.error : null) ||
          t(odometerErrorMessageKey('error' in res ? res.error : null)) ||
          t('bookings.completeFailed'),
      );
      return false;
    }

    setTripBooking((prev) => (prev ? { ...prev, status: 'completed' } : null));
    Alert.alert(t('common.success'), t('bookings.completeSuccess'));
    return true;
  }

  async function finishTripAndStopTracking() {
    setCompleting(true);
    const ok = await completeActiveBooking();
    setCompleting(false);
    if (ok) {
      await stopTracking();
    }
  }

  const tripStatus = String(tripBooking?.status ?? '').toLowerCase();
  const linkedInProgress = Boolean(bookingId && tripStatus === 'in_progress');
  const needsStartTripFirst = Boolean(
    bookingId && (tripStatus === 'accepted' || tripStatus === 'confirmed'),
  );

  function handleTrackingToggle() {
    if (!isTracking) {
      void startTracking();
      return;
    }

    if (!linkedInProgress) {
      void stopTracking();
      return;
    }

    if (isTourBookingKind(tripBooking!.kind)) {
      void finishTripAndStopTracking();
      return;
    }

    Alert.alert(t('bookings.completeTitle'), t('bookings.completeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('bookings.complete'), onPress: () => void finishTripAndStopTracking() },
    ]);
  }

  const endButtonLabel = isTracking
    ? linkedInProgress
      ? t('gpsScreen.endTrip')
      : t('gpsScreen.stopTracking')
    : t('gpsScreen.startTour');

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
      <BackgroundLocationDisclosureModal
        visible={disclosureVisible}
        onAccept={() => resolveDisclosure(true)}
        onDecline={() => resolveDisclosure(false)}
      />
      <MapErrorBoundary
        key={mapEpoch}
        onRetry={() => setMapEpoch((n) => n + 1)}
        fallback={
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.mapFallbackTitle}>{t('tracking.mapLoadError')}</Text>
            <Text style={styles.mapFallbackSub}>{t('tracking.mapUnavailable')}</Text>
          </View>
        }
      >
        <MapView
          key={`driver-gps-map-${mapEpoch}`}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={TBILISI}
          showsUserLocation={false}
          showsMyLocationButton={false}
        >
          {isTracking && currentLocation ? (
            <Marker
              coordinate={currentLocation}
              pinColor="blue"
              title={t('gpsScreen.yourPosition')}
              tracksViewChanges={false}
            />
          ) : null}
        </MapView>
      </MapErrorBoundary>

      <View style={[styles.badgeWrap, { top: insets.top + SPACING.sm }]}>
        <View style={[styles.badge, isTracking ? styles.badgeOn : styles.badgeOff]}>
          <Text style={[styles.badgeText, isTracking ? styles.badgeTextOn : styles.badgeTextOff]}>
            {isTracking ? t('gpsScreen.active') : t('gpsScreen.inactive')}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {locationDenied ? (
          <View style={styles.hintBanner}>
            <Ionicons name="location-outline" size={18} color={COLORS.error} />
            <Text style={styles.hintBannerText}>{t('tracking.locationPermissionDenied')}</Text>
          </View>
        ) : null}
        {needsStartTripFirst ? (
          <View style={styles.hintBanner}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.goldDark} />
            <Text style={styles.hintBannerText}>{t('gpsScreen.startTripFirstHint')}</Text>
          </View>
        ) : null}
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
          onPress={handleTrackingToggle}
          disabled={completing}
          style={({ pressed }) => [
            styles.toggle,
            isTracking ? styles.toggleEnd : styles.toggleStart,
            (pressed || completing) && styles.togglePressed,
          ]}
        >
          {completing ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={[styles.toggleText, isTracking && styles.toggleTextOnRed]}>
              {endButtonLabel}
            </Text>
          )}
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
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  mapFallbackTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  mapFallbackSub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gold,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  hintBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
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
