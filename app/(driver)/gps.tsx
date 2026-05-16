import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function DriverGpsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const stopWatch = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  }, []);

  useEffect(() => {
    void Location.requestForegroundPermissionsAsync();
  }, []);

  useEffect(() => {
    if (!isTracking || !currentLocation || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion({
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    });
  }, [isTracking, currentLocation]);

  useEffect(() => {
    return () => {
      stopWatch();
    };
  }, [stopWatch]);

  async function startTracking() {
    if (Platform.OS === 'web') return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    setIsTracking(true);
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 10,
      },
      (loc) => {
        setCurrentLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      },
    );
    watchRef.current = sub;
  }

  function endTour() {
    stopWatch();
    setIsTracking(false);
  }

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
        <Pressable
          onPress={() => void (isTracking ? endTour() : startTracking())}
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
