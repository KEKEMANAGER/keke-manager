import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { LeafletDriverMap, type LeafletMapPin } from '../../components/LeafletDriverMap';
import { MapErrorBoundary } from '../../components/maps/MapErrorBoundary';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  fetchCompanyActiveGpsDrivers,
  isCompanyGpsLocationStale,
  type CompanyGpsDriverPin,
} from '../../lib/companyGps';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLocationsForDriverIds, subscribeToDriverLocations } from '../../lib/locations';
import { supabase } from '../../lib/supabase';
import { vehicleClassLabel, vehicleTypeLabel } from '../../lib/vehicleCatalog';

const TBILISI: Region = {
  latitude: 41.6938,
  longitude: 44.8015,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const BOOKING_REFRESH_MS = 60_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return '< 5s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function vehicleLabel(pin: CompanyGpsDriverPin): string {
  return [
    pin.vehicle_type ? vehicleTypeLabel(pin.vehicle_type) : null,
    pin.vehicle_class ? vehicleClassLabel(pin.vehicle_class) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    accepted: { bg: '#DBEAFE', color: '#1D4ED8', label: t('tracking.statusAccepted') },
    in_progress: { bg: '#FFEDD5', color: '#B45309', label: t('tracking.statusInProgress') },
  };
  const c = cfg[status] ?? { bg: '#F3F4F6', color: '#6B7280', label: status };
  return (
    <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
      <Text style={[styles.statusText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function driverDisplayName(pin: CompanyGpsDriverPin, t: (k: string) => string): string {
  return pin.full_name?.trim() || t('common.driver');
}

export default function CompanyGpsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const mapRef = useRef<MapView | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [pins, setPins] = useState<CompanyGpsDriverPin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [mapEpoch, setMapEpoch] = useState(0);

  const driverIds = useMemo(() => pins.map((p) => p.driver_id), [pins]);

  const loadDrivers = useCallback(async () => {
    if (!user?.id) {
      setPins([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchCompanyActiveGpsDrivers(user.id);
      setPins(data);
      setSelectedId((prev) => {
        if (prev && data.some((p) => p.driver_id === prev)) return prev;
        return data.find((p) => p.latitude != null)?.driver_id ?? data[0]?.driver_id ?? null;
      });
    } catch (e) {
      if (__DEV__) console.warn('[company-gps] loadDrivers failed:', e);
      setPins([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const mergeLocations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { data: locs } = await fetchLocationsForDriverIds(ids);
      const locMap = new Map((locs ?? []).map((l) => [l.driver_id, l]));
      setPins((prev) =>
        prev.map((pin) => {
          const loc = locMap.get(pin.driver_id);
          if (!loc) return pin;
          return {
            ...pin,
            latitude: loc.latitude,
            longitude: loc.longitude,
            updated_at: loc.updated_at,
            full_name: loc.full_name ?? pin.full_name,
          };
        }),
      );
    } catch (e) {
      if (__DEV__) console.warn('[company-gps] mergeLocations failed:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDrivers();
    }, [loadDrivers]),
  );

  useEffect(() => {
    if (!user?.id) return;
    const id = setInterval(() => void loadDrivers(), BOOKING_REFRESH_MS);
    return () => clearInterval(id);
  }, [user?.id, loadDrivers]);

  useEffect(() => {
    if (driverIds.length === 0) return;
    const ch = subscribeToDriverLocations(driverIds, () => void mergeLocations(driverIds));
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [driverIds, mergeLocations]);

  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 5000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const selectedPin =
    pins.find((p) => p.driver_id === selectedId) ??
    pins.find((p) => p.latitude != null) ??
    pins[0] ??
    null;

  const mapPins = pins.filter(
    (p): p is CompanyGpsDriverPin & { latitude: number; longitude: number; updated_at: string } =>
      p.latitude != null && p.longitude != null && p.updated_at != null,
  );

  useEffect(() => {
    if (!selectedPin?.latitude || !selectedPin.longitude || Platform.OS === 'web') return;
    try {
      mapRef.current?.animateToRegion(
        {
          latitude: selectedPin.latitude,
          longitude: selectedPin.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        600,
      );
    } catch (e) {
      if (__DEV__) console.warn('[company-gps] animateToRegion failed:', e);
    }
  }, [selectedPin?.driver_id, selectedPin?.latitude, selectedPin?.longitude]);

  const hasLocation =
    selectedPin?.latitude != null &&
    selectedPin.longitude != null &&
    selectedPin.updated_at != null;
  const isStale = hasLocation ? isCompanyGpsLocationStale(selectedPin!.updated_at) : false;
  const vehicle = selectedPin ? vehicleLabel(selectedPin) : '';

  function openChat(pin: CompanyGpsDriverPin) {
    const name = driverDisplayName(pin, t);
    router.push({
      pathname: '/(app)/chat',
      params: {
        uid: pin.driver_id,
        name,
        bookingId: pin.booking_id,
        threadType: 'company_driver',
        senderRole: 'company',
        receiverRole: 'driver',
      },
    });
  }

  function callPhone(phone: string) {
    void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  }

  const leafletPins: LeafletMapPin[] = mapPins.map((pin) => ({
    driver_id: pin.driver_id,
    latitude: pin.latitude,
    longitude: pin.longitude,
    updated_at: pin.updated_at,
    full_name: pin.full_name,
    isHost: pin.is_assigned_driver,
    color: isCompanyGpsLocationStale(pin.updated_at) ? COLORS.textMuted : undefined,
  }));

  const detailPanel = selectedPin ? (
    <>
      <View style={styles.infoRow}>
        <Ionicons name="person-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.infoLabel}>{t('tracking.driver')}</Text>
        <View style={styles.infoRight}>
          <Text style={styles.infoValue} numberOfLines={1}>
            {driverDisplayName(selectedPin, t)}
          </Text>
          {!selectedPin.is_assigned_driver ? (
            <Text style={styles.infoSub}>{t('fleet.subDriver')}</Text>
          ) : null}
          {selectedPin.driver_phone ? (
            <Text style={styles.infoSub}>{selectedPin.driver_phone}</Text>
          ) : null}
        </View>
      </View>

      {vehicle ? (
        <View style={styles.infoRow}>
          <Ionicons name="car-outline" size={15} color={COLORS.textSecondary} />
          <Text style={styles.infoLabel}>{t('tracking.vehicle')}</Text>
          <Text style={styles.infoValue}>{vehicle}</Text>
        </View>
      ) : null}

      {selectedPin.route ? (
        <View style={styles.infoRow}>
          <Ionicons name="map-outline" size={15} color={COLORS.textSecondary} />
          <Text style={styles.infoLabel}>{t('companyGps.route')}</Text>
          <Text style={styles.infoValue} numberOfLines={2}>
            {selectedPin.route}
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      {hasLocation ? (
        <>
          <View style={styles.coordRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LAT</Text>
              <Text style={styles.coordValue}>{selectedPin.latitude!.toFixed(6)}</Text>
            </View>
            <View style={styles.coordSep} />
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LNG</Text>
              <Text style={styles.coordValue}>{selectedPin.longitude!.toFixed(6)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={15} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>{t('tracking.lastUpdated')}</Text>
            <Text style={[styles.infoValue, isStale && styles.infoValueStale]}>
              {formatTime(selectedPin.updated_at!)} · {formatAgo(selectedPin.updated_at!)}{' '}
              {t('tracking.ago')}
            </Text>
          </View>
        </>
      ) : !loading ? (
        <View style={styles.noSignalWrap}>
          <Ionicons name="navigate-outline" size={28} color={COLORS.textMuted} />
          <Text style={styles.noSignalText}>{t('tracking.noSignalHint')}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => openChat(selectedPin)}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chatbubble-outline" size={16} color={COLORS.black} />
          <Text style={styles.actionBtnText}>{t('companyVoucher.chatDriver')}</Text>
        </Pressable>
        {selectedPin.driver_phone ? (
          <Pressable
            onPress={() => callPhone(selectedPin.driver_phone!)}
            style={({ pressed }) => [styles.actionBtnOutline, pressed && styles.pressed]}
          >
            <Ionicons name="call-outline" size={16} color={COLORS.goldDark} />
            <Text style={styles.actionBtnOutlineText}>{t('companyVoucher.callDriver')}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  ) : null;

  if (!loading && pins.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <Ionicons name="navigate-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyTitle}>{t('companyGps.empty')}</Text>
        <Text style={styles.emptyHint}>{t('companyGps.emptyHint')}</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.screen, styles.webScreen]}>
        <View style={styles.webHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('tabs.gps')}</Text>
            <Text style={styles.headerSub}>
              {t('companyGps.activeDrivers', { count: pins.length })}
            </Text>
          </View>
          {selectedPin?.booking_status ? (
            <StatusBadge status={selectedPin.booking_status} t={t} />
          ) : null}
        </View>

        <View style={styles.webBodyRow}>
          <View style={styles.webMapPane}>
            <LeafletDriverMap
              pins={leafletPins}
              selectedId={selectedId}
              hostDriverId={selectedPin?.assigned_driver_id}
              onSelectPin={setSelectedId}
            />
            <View style={styles.webBadgeOverlay}>
              {loading ? (
                <View style={[styles.badge, styles.badgeLoading]}>
                  <ActivityIndicator size="small" color={COLORS.gold} />
                </View>
              ) : hasLocation ? (
                <View style={[styles.badge, isStale ? styles.badgeStale : styles.badgeLive]}>
                  <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
                  <Text style={[styles.badgeText, isStale ? styles.textStale : styles.textLive]}>
                    {isStale ? t('tracking.weakSignal') : t('tracking.live')}
                  </Text>
                </View>
              ) : selectedPin ? (
                <View style={[styles.badge, styles.badgeOff]}>
                  <View style={styles.dotOff} />
                  <Text style={[styles.badgeText, styles.textOff]}>{t('tracking.noSignal')}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <ScrollView style={styles.webSidebar} showsVerticalScrollIndicator={false}>
            <Text style={styles.webSidebarTitle}>{t('tracking.driversOnMap')}</Text>
            {pins.map((pin) => {
              const locOk = pin.latitude != null && pin.updated_at != null;
              const stale = locOk ? isCompanyGpsLocationStale(pin.updated_at) : true;
              const name = driverDisplayName(pin, t);
              return (
                <Pressable
                  key={pin.driver_id}
                  onPress={() => setSelectedId(pin.driver_id)}
                  style={[styles.webRow, selectedId === pin.driver_id && styles.webRowSelected]}
                >
                  <View
                    style={[
                      styles.webDot,
                      {
                        backgroundColor: !locOk
                          ? COLORS.textMuted
                          : stale
                            ? COLORS.textMuted
                            : pin.is_assigned_driver
                              ? COLORS.gold
                              : COLORS.blue,
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.webRowName}>
                      {name}
                      {pin.is_assigned_driver
                        ? ` (${t('fleet.host')})`
                        : ` (${t('fleet.subDriver')})`}
                    </Text>
                    <Text style={styles.webRowMeta} numberOfLines={1}>
                      {pin.route ?? t('companyGps.noRoute')}
                    </Text>
                    <Text style={styles.webRowMeta}>
                      {locOk
                        ? `${formatAgo(pin.updated_at!)} ${t('tracking.ago')}`
                        : t('tracking.noSignal')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.webInfoCard}>{detailPanel}</View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
          key={`company-gps-map-${mapEpoch}`}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={TBILISI}
          showsUserLocation={false}
          showsMyLocationButton={false}
          onPress={() => setSelectedId(null)}
        >
          {mapPins.map((pin) => {
            const stale = isCompanyGpsLocationStale(pin.updated_at);
            return (
              <Marker
                key={pin.driver_id}
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                title={driverDisplayName(pin, t)}
                onPress={() => setSelectedId(pin.driver_id)}
                tracksViewChanges={false}
              >
                <View style={styles.markerWrap}>
                  <View
                    style={[
                      styles.markerDot,
                      pin.is_assigned_driver ? styles.markerDotHost : styles.markerDotSub,
                      stale && styles.markerDotStale,
                    ]}
                  >
                    <Ionicons name="car" size={16} color={COLORS.white} />
                  </View>
                  <View
                    style={[
                      styles.markerTail,
                      pin.is_assigned_driver ? styles.markerTailHost : styles.markerTailSub,
                      stale && styles.markerTailStale,
                    ]}
                  />
                </View>
              </Marker>
            );
          })}
        </MapView>
      </MapErrorBoundary>

      <View style={styles.badgeWrap}>
        {loading ? (
          <View style={[styles.badge, styles.badgeLoading]}>
            <ActivityIndicator size="small" color={COLORS.gold} />
          </View>
        ) : hasLocation ? (
          <View style={[styles.badge, isStale ? styles.badgeStale : styles.badgeLive]}>
            <View style={[styles.dot, isStale ? styles.dotStale : styles.dotLive]} />
            <Text style={[styles.badgeText, isStale ? styles.textStale : styles.textLive]}>
              {isStale ? t('tracking.weakSignal') : t('tracking.live')}
            </Text>
          </View>
        ) : selectedPin ? (
          <View style={[styles.badge, styles.badgeOff]}>
            <View style={styles.dotOff} />
            <Text style={[styles.badgeText, styles.textOff]}>{t('tracking.noSignal')}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.nativeDriverStrip}
        contentContainerStyle={styles.nativeDriverStripContent}
      >
        {pins.map((pin) => (
          <Pressable
            key={pin.driver_id}
            onPress={() => setSelectedId(pin.driver_id)}
            style={[styles.nativeChip, selectedId === pin.driver_id && styles.nativeChipSelected]}
          >
            <Text style={styles.nativeChipText} numberOfLines={1}>
              {driverDisplayName(pin, t)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.infoCard}>{detailPanel}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  webScreen: { minHeight: '100vh' as unknown as number },
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptyHint: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  mapFallbackTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  mapFallbackSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  statusText: { fontSize: 11, fontWeight: '700' },
  badgeWrap: {
    position: 'absolute',
    top: SPACING.sm,
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
  nativeDriverStrip: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    maxHeight: 44,
    zIndex: 4,
  },
  nativeDriverStripContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    alignItems: 'center',
  },
  nativeChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: 160,
  },
  nativeChipSelected: { backgroundColor: COLORS.goldTint, borderColor: COLORS.gold },
  nativeChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  infoCard: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    bottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    maxHeight: '45%',
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
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.black },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.white,
  },
  actionBtnOutlineText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  pressed: { opacity: 0.85 },
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    paddingBottom: SPACING.md,
    ...SHADOWS.card,
  },
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
