import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LeafletDriverMap, type LeafletMapPin } from '../../components/LeafletDriverMap';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { fetchFleetDriverIdsAround } from '../../lib/fleet';
import {
  fetchLocationsForDriverIds,
  subscribeToDriverLocations,
  type DriverLocationPin,
} from '../../lib/locations';
import { supabase } from '../../lib/supabase';
import { vehicleClassLabel, vehicleTypeLabel } from '../../lib/vehicleCatalog';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

type BookingInfo = {
  driver_id: string;
  driver_display_name: string | null;
  driver_phone: string | null;
  status: string;
  from_location: string | null;
  to_location: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return '< 5s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    accepted: { bg: '#DBEAFE', color: '#1D4ED8', label: t('tracking.statusAccepted') },
    in_progress: { bg: '#FFEDD5', color: '#B45309', label: t('tracking.statusInProgress') },
    pending: { bg: '#F3F4F6', color: '#6B7280', label: t('tracking.statusPending') },
  };
  const c = cfg[status] ?? { bg: '#F3F4F6', color: '#6B7280', label: status };
  return (
    <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function pinStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 60_000;
}

export default function CompanyTrackingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId, driverId: paramDriverId, driverName: paramDriverName } =
    useLocalSearchParams<{ bookingId?: string; driverId?: string; driverName?: string }>();

  const mapRef = useRef<MapView | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [pins, setPins] = useState<DriverLocationPin[]>([]);
  const [fleetIds, setFleetIds] = useState<string[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const driverId = booking?.driver_id ?? paramDriverId ?? '';
  const driverName =
    booking?.driver_display_name?.trim() ||
    paramDriverName?.trim() ||
    t('common.driver');

  const reloadPins = useCallback(async (ids: string[]) => {
    const { data } = await fetchLocationsForDriverIds(ids);
    setPins(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    void supabase
      .from('bookings')
      .select(
        'driver_id, driver_display_name, driver_phone, status, from_location, to_location, vehicle_type, vehicle_class',
      )
      .eq('id', bookingId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBooking(data as BookingInfo);
      });
  }, [bookingId]);

  useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    void (async () => {
      const ids = await fetchFleetDriverIdsAround(driverId);
      setFleetIds(ids);
      await reloadPins(ids);
    })();
  }, [driverId, reloadPins]);

  useEffect(() => {
    if (!bookingId && paramDriverId) setLoading(false);
  }, [bookingId, paramDriverId]);

  useEffect(() => {
    if (fleetIds.length === 0) return;
    const ch = subscribeToDriverLocations(fleetIds, () => void reloadPins(fleetIds));
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [fleetIds, reloadPins]);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 5000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const activePin =
    pins.find((p) => p.driver_id === (selectedPinId ?? driverId)) ??
    pins.find((p) => p.driver_id === driverId) ??
    pins[0] ??
    null;

  useEffect(() => {
    if (!activePin || Platform.OS === 'web') return;
    mapRef.current?.animateToRegion(
      {
        latitude: activePin.latitude,
        longitude: activePin.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      600,
    );
  }, [activePin]);

  const isActive = !!activePin;
  const isStale = activePin ? pinStale(activePin.updated_at) : false;
  const isFleet = fleetIds.length > 1;

  const route = [booking?.from_location, booking?.to_location].filter(Boolean).join(' → ');
  const vehicleLabel = [
    booking?.vehicle_type ? vehicleTypeLabel(booking.vehicle_type) : null,
    booking?.vehicle_class ? vehicleClassLabel(booking.vehicle_class) : null,
  ].filter(Boolean).join(' · ');

  const webSelectedId = selectedPinId ?? driverId;
  const leafletPins: LeafletMapPin[] = pins.map((pin) => ({
    driver_id: pin.driver_id,
    latitude: pin.latitude,
    longitude: pin.longitude,
    updated_at: pin.updated_at,
    full_name: pin.full_name,
    isHost: pin.driver_id === driverId,
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.screen, styles.webScreen, { paddingTop: insets.top }]}>
        <View style={styles.webHeader}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {isFleet ? t('tracking.fleetTitle') : driverName}
            </Text>
            {route ? <Text style={styles.headerSub} numberOfLines={1}>{route}</Text> : null}
            {isFleet ? (
              <Text style={styles.headerSub}>
                {t('tracking.fleetDrivers', { count: fleetIds.length })}
              </Text>
            ) : null}
          </View>
          {booking?.status ? <StatusBadge status={booking.status} t={t} /> : null}
        </View>

        <View style={styles.webBodyRow}>
          <View style={styles.webMapPane}>
            <LeafletDriverMap
              pins={leafletPins}
              selectedId={webSelectedId}
              hostDriverId={driverId}
              onSelectPin={setSelectedPinId}
            />
            <View style={styles.webBadgeOverlay}>
              {loading ? (
                <View style={[styles.badge, styles.badgeLoading]}>
                  <ActivityIndicator size="small" color={COLORS.gold} />
                </View>
              ) : isActive ? (
                <View style={[styles.badge, isStale ? styles.badgeStale : styles.badgeLive]}>
                  <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
                  <Text style={[styles.badgeText, isStale ? styles.textStale : styles.textLive]}>
                    {isStale ? t('tracking.weakSignal') : t('tracking.live')}
                  </Text>
                </View>
              ) : (
                <View style={[styles.badge, styles.badgeOff]}>
                  <View style={styles.dotOff} />
                  <Text style={[styles.badgeText, styles.textOff]}>{t('tracking.noSignal')}</Text>
                </View>
              )}
            </View>
          </View>

          <ScrollView style={styles.webSidebar} showsVerticalScrollIndicator={false}>
            <Text style={styles.webSidebarTitle}>{t('tracking.driversOnMap')}</Text>
            {fleetIds.map((id) => {
              const pin = pins.find((p) => p.driver_id === id);
              const isHost = id === driverId;
              const name = pin?.full_name ?? (isHost ? driverName : t('fleet.subDriver'));
              return (
                <Pressable
                  key={id}
                  onPress={() => setSelectedPinId(id)}
                  style={[styles.webRow, webSelectedId === id && styles.webRowSelected]}
                >
                  <View style={[styles.webDot, { backgroundColor: isHost ? COLORS.gold : COLORS.blue }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.webRowName}>
                      {name}
                      {isHost ? ` (${t('fleet.host')})` : ` (${t('fleet.subDriver')})`}
                    </Text>
                    <Text style={styles.webRowMeta}>
                      {pin
                        ? `${formatAgo(pin.updated_at)} ${t('tracking.ago')}`
                        : t('tracking.noSignal')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.webInfoCard, { paddingBottom: insets.bottom + SPACING.md }]}>
          {activePin ? (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={15} color={COLORS.textSecondary} />
                <Text style={styles.infoLabel}>{t('tracking.driver')}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {activePin.full_name ?? driverName}
                </Text>
              </View>
              {vehicleLabel ? (
                <View style={styles.infoRow}>
                  <Ionicons name="car-outline" size={15} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>{t('tracking.vehicle')}</Text>
                  <Text style={styles.infoValue}>{vehicleLabel}</Text>
                </View>
              ) : null}
              <View style={styles.coordRow}>
                <View style={styles.coordItem}>
                  <Text style={styles.coordLabel}>LAT</Text>
                  <Text style={styles.coordValue}>{activePin.latitude.toFixed(6)}</Text>
                </View>
                <View style={styles.coordSep} />
                <View style={styles.coordItem}>
                  <Text style={styles.coordLabel}>LNG</Text>
                  <Text style={styles.coordValue}>{activePin.longitude.toFixed(6)}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={15} color={COLORS.textSecondary} />
                <Text style={styles.infoLabel}>{t('tracking.lastUpdated')}</Text>
                <Text style={[styles.infoValue, isStale && styles.infoValueStale]}>
                  {formatTime(activePin.updated_at)} · {formatAgo(activePin.updated_at)} {t('tracking.ago')}
                </Text>
              </View>
            </>
          ) : !loading ? (
            <View style={styles.noSignalWrap}>
              <Ionicons name="navigate-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.noSignalText}>{t('tracking.noSignalHint')}</Text>
            </View>
          ) : null}
        </View>
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
        onPress={() => setSelectedPinId(null)}
      >
        {pins.map((pin) => {
          const isHost = pin.driver_id === driverId;
          const stale = pinStale(pin.updated_at);
          return (
            <Marker
              key={pin.driver_id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              title={pin.full_name ?? t('common.driver')}
              onPress={() => setSelectedPinId(pin.driver_id)}
            >
              <View style={styles.markerWrap}>
                <View
                  style={[
                    styles.markerDot,
                    isHost ? styles.markerDotHost : styles.markerDotSub,
                    stale && styles.markerDotStale,
                  ]}
                >
                  <Ionicons name="car" size={16} color={COLORS.white} />
                </View>
                <View
                  style={[
                    styles.markerTail,
                    isHost ? styles.markerTailHost : styles.markerTailSub,
                    stale && styles.markerTailStale,
                  ]}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isFleet ? t('tracking.fleetTitle') : driverName}
          </Text>
          {route ? <Text style={styles.headerSub} numberOfLines={1}>{route}</Text> : null}
          {isFleet ? (
            <Text style={styles.headerSub}>
              {t('tracking.fleetDrivers', { count: fleetIds.length })}
            </Text>
          ) : null}
        </View>
        {booking?.status ? <StatusBadge status={booking.status} t={t} /> : null}
      </View>

      <View style={[styles.badgeWrap, { top: insets.top + 64 }]}>
        {loading ? (
          <View style={[styles.badge, styles.badgeLoading]}>
            <ActivityIndicator size="small" color={COLORS.gold} />
          </View>
        ) : isActive ? (
          <View style={[styles.badge, isStale ? styles.badgeStale : styles.badgeLive]}>
            <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
            <Text style={[styles.badgeText, isStale ? styles.textStale : styles.textLive]}>
              {isStale ? t('tracking.weakSignal') : t('tracking.live')}
            </Text>
          </View>
        ) : (
          <View style={[styles.badge, styles.badgeOff]}>
            <View style={styles.dotOff} />
            <Text style={[styles.badgeText, styles.textOff]}>{t('tracking.noSignal')}</Text>
          </View>
        )}
      </View>

      <View style={[styles.infoCard, { paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={15} color={COLORS.textSecondary} />
          <Text style={styles.infoLabel}>{t('tracking.driver')}</Text>
          <View style={styles.infoRight}>
            <Text style={styles.infoValue} numberOfLines={1}>
              {activePin?.full_name ?? driverName}
            </Text>
            {activePin && activePin.driver_id !== driverId ? (
              <Text style={styles.infoSub}>{t('fleet.subDriver')}</Text>
            ) : isFleet ? (
              <Text style={styles.infoSub}>{t('fleet.host')}</Text>
            ) : null}
            {booking?.driver_phone ? <Text style={styles.infoSub}>{booking.driver_phone}</Text> : null}
          </View>
        </View>

        {vehicleLabel ? (
          <View style={styles.infoRow}>
            <Ionicons name="car-outline" size={15} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>{t('tracking.vehicle')}</Text>
            <Text style={styles.infoValue}>{vehicleLabel}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        {activePin ? (
          <>
            <View style={styles.coordRow}>
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LAT</Text>
                <Text style={styles.coordValue}>{activePin.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.coordSep} />
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LNG</Text>
                <Text style={styles.coordValue}>{activePin.longitude.toFixed(6)}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={15} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>{t('tracking.lastUpdated')}</Text>
              <Text style={[styles.infoValue, isStale && styles.infoValueStale]}>
                {formatTime(activePin.updated_at)} · {formatAgo(activePin.updated_at)} {t('tracking.ago')}
              </Text>
            </View>
          </>
        ) : !loading ? (
          <View style={styles.noSignalWrap}>
            <Ionicons name="navigate-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.noSignalText}>{t('tracking.noSignalHint')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  statusText: { fontSize: 11, fontWeight: '700' },
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
  badgeLive: { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)' },
  badgeStale: { backgroundColor: 'rgba(245,166,35,0.15)', borderColor: 'rgba(245,166,35,0.4)' },
  badgeOff: { backgroundColor: 'rgba(107,114,128,0.12)', borderColor: COLORS.border },
  badgeLoading: { backgroundColor: COLORS.white, borderColor: COLORS.border, paddingHorizontal: SPACING.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLive: { backgroundColor: COLORS.success },
  dotStale: { backgroundColor: COLORS.gold },
  dotOff: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted },
  badgeText: { fontSize: 13, fontWeight: '700' },
  textLive: { color: COLORS.success },
  textStale: { color: COLORS.goldDark },
  textOff: { color: COLORS.textSecondary },
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.card,
  },
  markerDotHost: { backgroundColor: COLORS.gold },
  markerDotSub: { backgroundColor: COLORS.blue },
  markerDotStale: { backgroundColor: COLORS.textMuted },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  markerTailHost: { borderTopColor: COLORS.gold },
  markerTailSub: { borderTopColor: COLORS.blue },
  markerTailStale: { borderTopColor: COLORS.textMuted },
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
  infoLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', width: 70 },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoValue: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  infoSub: { color: COLORS.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 1 },
  infoValueStale: { color: COLORS.goldDark },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
  coordRow: { flexDirection: 'row', paddingVertical: SPACING.xs },
  coordItem: { flex: 1 },
  coordSep: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.sm },
  coordLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 2 },
  coordValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  noSignalWrap: { alignItems: 'center', paddingVertical: SPACING.md, gap: SPACING.sm },
  noSignalText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
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
  webBadgeOverlay: {
    position: 'absolute',
    top: SPACING.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 500,
    pointerEvents: 'none',
  },
  webSidebar: {
    width: 280,
    maxWidth: '32%',
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
  webInfoCard: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    ...SHADOWS.card,
  },
  webList: { flex: 1, paddingHorizontal: SPACING.md },
  webRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  webRowSelected: { backgroundColor: COLORS.goldTint },
  webDot: { width: 10, height: 10, borderRadius: 5 },
  webRowName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  webRowMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
});
