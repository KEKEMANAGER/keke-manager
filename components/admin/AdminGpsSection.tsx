import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  fetchAllLocationsWithInfo,
  subscribeToAllLocations,
  type DriverLocationWithInfo,
} from '../../lib/locations';
import { supabase } from '../../lib/supabase';
import { vehicleTypeLabel } from '../../lib/vehicleCatalog';
import { adminStyles } from './adminStyles';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

const MAP_HEIGHT = 380;

function markerColor(loc: DriverLocationWithInfo): string {
  const stale = Date.now() - new Date(loc.updated_at).getTime() > 90_000;
  if (stale) return COLORS.textMuted;
  if (loc.booking_status === 'in_progress') return COLORS.gold;
  if (loc.booking_status === 'accepted') return COLORS.blue;
  return '#6B7280';
}

function statusLabel(status: string | null, t: (k: string) => string): string {
  if (!status) return t('adminTracking.noBooking');
  const map: Record<string, string> = {
    accepted: t('tracking.statusAccepted'),
    in_progress: t('tracking.statusInProgress'),
    pending: t('tracking.statusPending'),
  };
  return map[status] ?? status;
}

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return '< 5s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

export function AdminGpsSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const [locations, setLocations] = useState<DriverLocationWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await fetchAllLocationsWithInfo();
    setLocations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const ch = subscribeToAllLocations(() => void reload(true));
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [reload]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View>
        <Text style={styles.webHint}>{t('adminTracking.webFallback')}</Text>
        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.md }} />
        ) : locations.length === 0 ? (
          <Text style={adminStyles.empty}>{t('adminTracking.noActiveDrivers')}</Text>
        ) : (
          locations.map((loc) => (
            <View key={loc.driver_id} style={adminStyles.card}>
              <Text style={adminStyles.cardTitle}>{loc.full_name ?? t('common.driver')}</Text>
              <Text style={adminStyles.cardMeta}>
                {statusLabel(loc.booking_status, t)}
                {loc.vehicle_type ? ` · ${vehicleTypeLabel(loc.vehicle_type)}` : ''}
                {` · ${formatAgo(loc.updated_at)} ${t('tracking.ago')}`}
              </Text>
            </View>
          ))
        )}
        <Pressable
          onPress={() => router.push('/(app)/admin-tracking')}
          style={[adminStyles.btnGold, { marginTop: SPACING.md, alignSelf: 'flex-start' }]}
        >
          <Text style={adminStyles.btnGoldText}>{t('adminPanel.openFullMap')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.mapHeader}>
        <Text style={styles.mapTitle}>
          {t('adminTracking.activeDrivers', { count: locations.length })}
        </Text>
        {loading ? <ActivityIndicator size="small" color={COLORS.gold} /> : null}
      </View>
      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={TBILISI} showsUserLocation={false}>
          {locations.map((loc) => {
            const color = markerColor(loc);
            return (
              <Marker
                key={loc.driver_id}
                coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              >
                <View style={styles.markerWrap}>
                  <View style={[styles.markerDot, { backgroundColor: color }]}>
                    <Ionicons name="car" size={12} color={COLORS.white} />
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
        {!loading && locations.length === 0 ? (
          <View style={styles.mapEmpty}>
            <Text style={styles.mapEmptyText}>{t('adminTracking.noActiveDrivers')}</Text>
          </View>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverStrip}>
        {locations.map((loc) => (
          <Pressable
            key={loc.driver_id}
            onPress={() =>
              router.push({
                pathname: '/(app)/tracking',
                params: { driverId: loc.driver_id, driverName: loc.full_name ?? '' },
              })
            }
            style={styles.driverChip}
          >
            <View style={[styles.dot, { backgroundColor: markerColor(loc) }]} />
            <Text style={styles.driverChipName} numberOfLines={1}>
              {loc.full_name ?? t('common.driver')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        onPress={() => router.push('/(app)/admin-tracking')}
        style={[adminStyles.btnOutline, { marginTop: SPACING.sm, alignSelf: 'flex-start' }]}
      >
        <Text style={adminStyles.btnOutlineText}>{t('adminPanel.openFullMap')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  webHint: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  mapTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  mapWrap: {
    height: MAP_HEIGHT,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  map: { flex: 1 },
  mapEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  mapEmptyText: { color: COLORS.textMuted, fontWeight: '600' },
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.card,
  },
  callout: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 100,
  },
  calloutName: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  calloutMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  driverStrip: { marginTop: SPACING.sm, maxHeight: 48 },
  driverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 160,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  driverChipName: { fontSize: 12, fontWeight: '600', color: COLORS.text, flexShrink: 1 },
});
