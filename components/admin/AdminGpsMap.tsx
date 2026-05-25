import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS } from '../../constants/theme';
import {
  adminGpsMarkerColor,
  type AdminGpsDriverLocation,
} from '../../lib/adminGps';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

export type AdminGpsMapProps = {
  locations: AdminGpsDriverLocation[];
  selectedId: string | null;
  onSelectDriver: (driverId: string) => void;
  mapHeight?: number;
};

function statusLabel(status: string | null, t: (k: string) => string): string {
  if (!status) return t('adminTracking.noBooking');
  const map: Record<string, string> = {
    accepted: t('tracking.statusAccepted'),
    in_progress: t('tracking.statusInProgress'),
    pending: t('tracking.statusPending'),
  };
  return map[status] ?? status;
}

export function AdminGpsMap({
  locations,
  selectedId,
  onSelectDriver,
  mapHeight = 380,
}: AdminGpsMapProps) {
  const { t } = useTranslation();
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const loc = locations.find((l) => l.driver_id === selectedId);
    if (!loc) return;
    mapRef.current.animateToRegion(
      {
        latitude: loc.latitude,
        longitude: loc.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      350,
    );
  }, [selectedId, locations]);

  return (
    <View style={[styles.wrap, { height: mapHeight }]}>
      <MapView ref={mapRef} style={styles.map} initialRegion={TBILISI} showsUserLocation={false}>
        {locations.map((loc) => {
          const color = adminGpsMarkerColor(loc);
          const selected = loc.driver_id === selectedId;
          return (
            <Marker
              key={loc.driver_id}
              coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              onPress={() => onSelectDriver(loc.driver_id)}
            >
              <View style={styles.markerWrap}>
                <View
                  style={[
                    styles.markerDot,
                    { backgroundColor: color },
                    selected ? styles.markerSelected : undefined,
                  ]}
                >
                  <Ionicons name="car" size={selected ? 14 : 12} color={COLORS.white} />
                </View>
              </View>
              <Callout tooltip>
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={1}>
                    {loc.full_name ?? t('common.driver')}
                  </Text>
                  <Text style={styles.calloutMeta}>{statusLabel(loc.booking_status, t)}</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  map: { flex: 1 },
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.card,
  },
  markerSelected: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: COLORS.black,
  },
  callout: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 100,
  },
  calloutName: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  calloutMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});
