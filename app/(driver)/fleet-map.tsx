import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { LeafletDriverMap, type LeafletMapPin } from '../../components/LeafletDriverMap';
import { COLORS, SPACING } from '../../constants/theme';
import {
  fetchDriverLocation,
  subscribeToDriverLocation,
  type DriverLocationRow,
} from '../../lib/locations';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function FleetMapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ driverId?: string; driverName?: string }>();
  const driverId = typeof params.driverId === 'string' ? params.driverId.trim() : '';
  const driverName =
    (typeof params.driverName === 'string' ? params.driverName.trim() : '') ||
    t('common.driver');

  const mapRef = useRef<MapView | null>(null);
  const [loc, setLoc] = useState<DriverLocationRow | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    const row = await fetchDriverLocation(driverId);
    setLoc(row);
    setLoading(false);
  }, [driverId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!driverId) return;
    const ch = subscribeToDriverLocation(driverId, (row) => setLoc(row));
    return () => {
      void ch.unsubscribe();
    };
  }, [driverId]);

  useEffect(() => {
    if (!loc || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion(
      {
        latitude: loc.latitude,
        longitude: loc.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      400,
    );
  }, [loc?.latitude, loc?.longitude]);

  const pins: LeafletMapPin[] = loc
    ? [
        {
          driver_id: driverId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updated_at: loc.updated_at,
          full_name: driverName,
        },
      ]
    : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('fleet.myDriver', { name: driverName })}</Text>
          <Text style={styles.sub}>{t('fleet.viewDriverGps')}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : !loc ? (
        <View style={styles.empty}>
          <Ionicons name="location-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>{t('fleet.gpsOff')}</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        <LeafletDriverMap pins={pins} style={styles.map} />
      ) : (
        <MapView ref={mapRef} style={styles.map} initialRegion={TBILISI}>
          <Marker
            coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
            title={driverName}
          />
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  back: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary },
  map: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
