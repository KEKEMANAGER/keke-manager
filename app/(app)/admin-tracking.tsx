import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  fetchAllLocationsWithInfo,
  subscribeToAllLocations,
  type DriverLocationWithInfo,
} from '../../lib/locations';
import { supabase } from '../../lib/supabase';
import { vehicleTypeLabel, vehicleClassLabel } from '../../lib/vehicleCatalog';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

function markerColor(loc: DriverLocationWithInfo): string {
  const stale = (Date.now() - new Date(loc.updated_at).getTime()) > 90_000;
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

export default function AdminTrackingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [locations, setLocations] = useState<DriverLocationWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverLocationWithInfo | null>(null);
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

  // Update "X ago" every 10s
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const selectedColor = selected ? markerColor(selected) : COLORS.gold;
  const selectedVehicle = [
    selected?.vehicle_type ? vehicleTypeLabel(selected.vehicle_type) : null,
    selected?.vehicle_class ? vehicleClassLabel(selected.vehicle_class) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={TBILISI}
        showsUserLocation={false}
        onPress={() => setSelected(null)}
      >
        {locations.map((loc) => {
          const color = markerColor(loc);
          return (
            <Marker
              key={loc.driver_id}
              coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
              onPress={() => setSelected(loc)}
            >
              <View style={styles.markerWrap}>
                <View style={[styles.markerDot, { backgroundColor: color }]}>
                  <Ionicons name="car" size={14} color={COLORS.white} />
                </View>
                <View style={[styles.markerTail, { borderTopColor: color }]} />
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

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('adminTracking.title')}</Text>
        <View style={styles.countBadge}>
          {loading
            ? <ActivityIndicator size="small" color={COLORS.gold} />
            : <Text style={styles.countText}>{locations.length}</Text>
          }
        </View>
      </View>

      {/* Legend */}
      <View style={[styles.legend, { top: insets.top + 64 }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.gold }]} />
          <Text style={styles.legendLabel}>{t('tracking.statusInProgress')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} />
          <Text style={styles.legendLabel}>{t('tracking.statusAccepted')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
          <Text style={styles.legendLabel}>{t('adminTracking.stale')}</Text>
        </View>
      </View>

      {/* Selected driver panel */}
      {selected ? (
        <View style={[styles.panel, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.panelHandle} />
          <View style={styles.panelHeader}>
            <View style={[styles.panelAvatar, { backgroundColor: selectedColor }]}>
              <Ionicons name="car" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelName} numberOfLines={1}>
                {selected.full_name ?? t('common.driver')}
              </Text>
              <Text style={styles.panelStatus}>{statusLabel(selected.booking_status, t)}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} style={styles.panelClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.panelDivider} />

          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>{t('tracking.vehicle')}</Text>
            <Text style={styles.panelValue}>{selectedVehicle || '—'}</Text>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>{t('tracking.lastUpdated')}</Text>
            <Text style={[styles.panelValue, (Date.now() - new Date(selected.updated_at).getTime()) > 90_000 && styles.panelValueStale]}>
              {formatAgo(selected.updated_at)} {t('tracking.ago')}
            </Text>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>LAT / LNG</Text>
            <Text style={styles.panelValue}>
              {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setSelected(null);
              router.push({
                pathname: '/(app)/tracking',
                params: { driverId: selected.driver_id, driverName: selected.full_name ?? '' },
              });
            }}
            style={styles.panelTrackBtn}
          >
            <Ionicons name="navigate" size={16} color="#0f0f0f" />
            <Text style={styles.panelTrackBtnText}>{t('adminTracking.openTracking')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Empty state overlay */}
      {!loading && locations.length === 0 ? (
        <View style={[styles.emptyOverlay, { bottom: insets.bottom + 80 }]}>
          <View style={styles.emptyCard}>
            <Ionicons name="navigate-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t('adminTracking.noActiveDrivers')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    zIndex: 10, ...SHADOWS.card,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text },
  countBadge: {
    minWidth: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1, borderColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  countText: { color: COLORS.goldDark, fontWeight: '800', fontSize: 14 },
  legend: {
    position: 'absolute', left: SPACING.md,
    flexDirection: 'row', gap: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    zIndex: 5, ...SHADOWS.card,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white, ...SHADOWS.card,
  },
  markerTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
  callout: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.card,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card,
    minWidth: 120,
  },
  calloutName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  calloutMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  panel: {
    position: 'absolute', left: SPACING.md, right: SPACING.md, bottom: 0,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
    ...SHADOWS.cardStrong,
  },
  panelHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: SPACING.md,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  panelAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  panelName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  panelStatus: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  panelClose: { padding: 4 },
  panelDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: SPACING.sm },
  panelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 4,
  },
  panelLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  panelValue: { fontSize: 13, color: COLORS.text, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: SPACING.sm },
  panelValueStale: { color: COLORS.goldDark },
  panelTrackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button, paddingVertical: 12,
    marginTop: SPACING.md,
  },
  panelTrackBtnText: { fontSize: 15, fontWeight: '800', color: '#0f0f0f' },
  emptyOverlay: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', zIndex: 5,
  },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    ...SHADOWS.card,
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  webScreen: { minHeight: '100vh' as unknown as number },
  webHeader: {
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
  webLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  webBodyRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 360,
    overflow: 'hidden',
  },
  webMapPane: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
    padding: SPACING.sm,
  },
  webSidebar: {
    width: 300,
    maxWidth: '34%',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  webSidebarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  webPanel: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.card,
  },
  webRowSelected: { backgroundColor: COLORS.goldTint },
  webRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  webDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  webRowName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  webRowMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
});
