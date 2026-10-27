import { Ionicons } from '@expo/vector-icons';
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
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  adminGpsCityOptions,
  adminGpsMarkerColor,
  adminGpsTelHref,
  fetchAllActiveDriverLocations,
  formatAdminGpsAgo,
  filterAdminGpsLocations,
  isAdminGpsActive,
  subscribeAdminGpsLocations,
  type AdminGpsDriverKind,
  type AdminGpsDriverLocation,
  type AdminGpsFilters,
} from '../../lib/adminGps';
import { supabase } from '../../lib/supabase';
import { vehicleTypeLabel } from '../../lib/vehicleCatalog';
import { adminStyles } from './adminStyles';
import { AdminGpsMap } from './AdminGpsMap';

type Props = {
  compact?: boolean;
  fullScreen?: boolean;
  onClose?: () => void;
};

const formatAgo = (iso: string) => formatAdminGpsAgo(iso);

/** Realtime fires on every position; the map needs at most one reload per this. */
const RELOAD_THROTTLE_MS = 3_000;

/** The driver's number, one tap from a call. */
function CallButton({
  phone,
  t,
  compact = false,
}: {
  phone: string | null;
  t: (k: string) => string;
  compact?: boolean;
}) {
  const href = adminGpsTelHref(phone);
  if (!href) {
    return <Text style={styles.noPhone}>{t('adminPanel.gps.noPhone')}</Text>;
  }
  return (
    <Pressable
      onPress={() => void Linking.openURL(href).catch(() => undefined)}
      style={({ pressed }) => [
        compact ? styles.callLink : styles.callBtn,
        pressed ? { opacity: 0.75 } : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t('adminPanel.gps.call')} ${phone}`}
      hitSlop={6}
    >
      <Ionicons name="call" size={compact ? 12 : 15} color={compact ? COLORS.goldDark : '#0f0f0f'} />
      <Text style={compact ? styles.callLinkText : styles.callBtnText} numberOfLines={1}>
        {phone}
      </Text>
    </Pressable>
  );
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

function kindLabel(kind: AdminGpsDriverKind, t: (k: string) => string): string {
  switch (kind) {
    case 'guide':
      return t('adminPanel.gps.kindGuide');
    case 'host':
      return t('adminPanel.gps.kindHost');
    case 'hired':
      return t('adminPanel.gps.kindHired');
    default:
      return t('adminPanel.gps.kindRegular');
  }
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : undefined]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
}

export function AdminGpsPanel({ compact = false, fullScreen = false, onClose }: Props) {
  const { t } = useTranslation();
  const [allLocations, setAllLocations] = useState<AdminGpsDriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [filters, setFilters] = useState<AdminGpsFilters>({
    kind: 'all',
    activity: 'all',
    city: 'all',
  });

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await fetchAllActiveDriverLocations();
      if (error) {
        setAllLocations([]);
        return;
      }
      setAllLocations(Array.isArray(data) ? data : []);
    } catch {
      setAllLocations([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Every driver's phone writes its position about once every 10 seconds on
  // the road; a full reload per write was a reload storm. One every few
  // seconds is as live as the map can show anyway.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ch = subscribeAdminGpsLocations(() => {
      if (reloadTimer.current) return;
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        void reload(true);
      }, RELOAD_THROTTLE_MS);
    });
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
      void supabase.removeChannel(ch);
    };
  }, [reload]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const cities = useMemo(() => adminGpsCityOptions(allLocations), [allLocations]);

  const locations = useMemo(
    () => filterAdminGpsLocations(allLocations, filters),
    [allLocations, filters],
  );

  const selected = locations.find((l) => l.driver_id === selectedId) ?? null;

  // "16 active" counted every driver who had ever sent a position, grey pins
  // included. Active means a position in the last 5 minutes.
  const activeCount = allLocations.filter((l) => isAdminGpsActive(l.updated_at)).length;
  const countSummary = t('adminPanel.gps.countSummary', {
    active: activeCount,
    total: allLocations.length,
  });

  const mapHeight = compact ? 380 : undefined;

  const legend = (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} />
        <Text style={styles.legendLabel}>{t('adminPanel.gps.kindRegular')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.gold }]} />
        <Text style={styles.legendLabel}>{t('adminPanel.gps.kindGuide')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.black }]} />
        <Text style={styles.legendLabel}>{t('adminPanel.gps.kindHost')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.error }]} />
        <Text style={styles.legendLabel}>{t('adminPanel.gps.kindHired')}</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
        <Text style={styles.legendLabel}>{t('adminPanel.gps.inactive')}</Text>
      </View>
    </View>
  );

  const filterRow = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
      <FilterChip
        label={t('adminPanel.gps.filterAllKinds')}
        active={filters.kind === 'all'}
        onPress={() => setFilters((f) => ({ ...f, kind: 'all' }))}
      />
      {(['regular', 'guide', 'host', 'hired'] as const).map((k) => (
        <FilterChip
          key={k}
          label={kindLabel(k, t)}
          active={filters.kind === k}
          onPress={() => setFilters((f) => ({ ...f, kind: k }))}
        />
      ))}
      <FilterChip
        label={t('adminPanel.gps.filterActive')}
        active={filters.activity === 'active'}
        onPress={() =>
          setFilters((f) => ({ ...f, activity: f.activity === 'active' ? 'all' : 'active' }))
        }
      />
      <FilterChip
        label={t('adminPanel.gps.filterInactive')}
        active={filters.activity === 'inactive'}
        onPress={() =>
          setFilters((f) => ({
            ...f,
            activity: f.activity === 'inactive' ? 'all' : 'inactive',
          }))
        }
      />
      <FilterChip
        label={t('adminPanel.gps.filterAllCities')}
        active={filters.city === 'all'}
        onPress={() => setFilters((f) => ({ ...f, city: 'all' }))}
      />
      {cities.map((city) => (
        <FilterChip
          key={city}
          label={city}
          active={filters.city === city}
          onPress={() => setFilters((f) => ({ ...f, city }))}
        />
      ))}
    </ScrollView>
  );

  const sidebar = (
    <ScrollView
      style={[styles.sidebar, compact ? { maxHeight: 400 } : undefined]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sidebarTitle}>{countSummary}</Text>
      {locations.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminTracking.noActiveDrivers')}</Text>
      ) : (
        locations.map((loc) => (
          <Pressable
            key={loc.driver_id}
            onPress={() => setSelectedId(loc.driver_id)}
            style={[styles.row, selectedId === loc.driver_id ? styles.rowSelected : undefined]}
          >
            <View style={[styles.rowDot, { backgroundColor: adminGpsMarkerColor(loc) }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {loc.full_name ?? t('common.driver')}
              </Text>
              <CallButton phone={loc.phone} t={t} compact />
              <Text style={styles.rowMeta} numberOfLines={2}>
                {kindLabel(loc.kind, t)}
                {loc.vehicle_type ? ` · ${vehicleTypeLabel(loc.vehicle_type)}` : ''}
              </Text>
              <Text style={styles.rowMeta}>
                {statusLabel(loc.booking_status, t)}
                {` · ${formatAgo(loc.updated_at)} ${t('tracking.ago')}`}
                {isAdminGpsActive(loc.updated_at) ? '' : ` · ${t('adminPanel.gps.inactive')}`}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );

  const mapBlock = (
    <View style={[styles.mapPane, compact ? styles.mapPaneCompact : styles.mapPaneFlex]}>
      {loading ? (
        <View style={styles.mapLoading}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : locations.length === 0 ? (
        <View style={styles.mapEmpty}>
          <Text style={styles.mapEmptyText}>{t('adminTracking.noActiveDrivers')}</Text>
        </View>
      ) : (
        <AdminGpsMap
          locations={locations}
          selectedId={selectedId}
          onSelectDriver={setSelectedId}
          mapHeight={mapHeight}
        />
      )}
    </View>
  );

  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <View style={styles.fullHeader}>
          <Text style={styles.fullTitle}>{t('adminTracking.title')}</Text>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.gold} />
          ) : (
            <Text style={styles.countBadge}>{countSummary}</Text>
          )}
          <View style={styles.headerSpacer} />
          {onClose ? (
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={26} color={COLORS.text} />
            </Pressable>
          ) : null}
        </View>
        {legend}
        {filterRow}
        <View style={styles.fullBody}>
          {mapBlock}
          {sidebar}
        </View>
        {selected ? (
          <View style={styles.detailBar}>
            <Text style={styles.detailName}>{selected.full_name ?? t('common.driver')}</Text>
            <View style={styles.detailCallRow}>
              <CallButton phone={selected.phone} t={t} />
            </View>
            <Text style={styles.detailMeta}>
              {selected.vehicle_label ?? '—'} · {formatAgo(selected.updated_at)} {t('tracking.ago')}
            </Text>
            {selected.gps_mode === 'foreground' ? (
              <Text style={styles.detailWarn}>⚠ {t('tracking.gpsForegroundOnly')}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.compactHeader}>
        <Text style={styles.compactTitle}>{countSummary}</Text>
        {loading ? <ActivityIndicator size="small" color={COLORS.gold} /> : null}
      </View>
      {legend}
      {Platform.OS === 'web' ? filterRow : null}
      <View style={Platform.OS === 'web' ? styles.compactBodyWeb : undefined}>
        {mapBlock}
        {Platform.OS === 'web' ? sidebar : null}
      </View>
      {Platform.OS !== 'web' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverStrip}>
          {locations.map((loc) => (
            <Pressable
              key={loc.driver_id}
              onPress={() => setSelectedId(loc.driver_id)}
              style={[styles.chipDriver, selectedId === loc.driver_id ? styles.chipDriverOn : undefined]}
            >
              <View style={[styles.rowDot, { backgroundColor: adminGpsMarkerColor(loc) }]} />
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Text style={styles.chipDriverName} numberOfLines={1}>
                  {loc.full_name ?? t('common.driver')}
                </Text>
                {loc.phone ? (
                  <Text style={styles.chipDriverPhone} numberOfLines={1}>
                    {loc.phone}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {Platform.OS !== 'web' && selected ? (
        <View style={styles.selectedCard}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.detailName} numberOfLines={1}>
              {selected.full_name ?? t('common.driver')}
            </Text>
            <Text style={styles.detailMeta} numberOfLines={2}>
              {statusLabel(selected.booking_status, t)}
              {` · ${formatAgo(selected.updated_at)} ${t('tracking.ago')}`}
              {isAdminGpsActive(selected.updated_at) ? '' : ` · ${t('adminPanel.gps.inactive')}`}
            </Text>
          </View>
          <CallButton phone={selected.phone} t={t} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    ...(Platform.OS === 'web'
      ? ({ width: '100%', height: '100%', minHeight: '100vh', maxHeight: '100vh' } as object)
      : {}),
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 2,
    ...SHADOWS.card,
  },
  fullTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  headerSpacer: { flex: 1 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '800',
    color: COLORS.goldDark,
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  filterScroll: { maxHeight: 44, marginBottom: SPACING.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    marginRight: SPACING.sm,
  },
  chipActive: {
    backgroundColor: COLORS.goldTint,
    borderColor: COLORS.gold,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.goldDark },
  fullBody: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    overflow: 'hidden',
  },
  compactBodyWeb: {
    flexDirection: 'row',
    minHeight: 400,
    gap: SPACING.sm,
  },
  mapPane: { position: 'relative' },
  mapPaneCompact: { flex: 1, minWidth: 0 },
  mapPaneFlex: { flex: 1, minWidth: 0, padding: SPACING.sm },
  mapLoading: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
  },
  mapEmpty: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapEmptyText: { color: COLORS.textMuted, fontWeight: '600' },
  sidebar: {
    width: Platform.OS === 'web' ? 280 : '100%',
    maxWidth: '36%',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowSelected: { backgroundColor: COLORS.goldTint },
  rowDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  rowName: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  detailBar: {
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  detailMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  detailWarn: { fontSize: 12, color: COLORS.goldDark, fontWeight: '600', marginTop: 4 },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  compactTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  driverStrip: { marginTop: SPACING.sm, maxHeight: 48 },
  chipDriver: {
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
  chipDriverOn: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  chipDriverName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipDriverPhone: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailCallRow: { flexDirection: 'row', marginTop: 6 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
  },
  callBtnText: { color: '#0f0f0f', fontWeight: '800', fontSize: 14 },
  callLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },
  callLinkText: { color: COLORS.goldDark, fontWeight: '700', fontSize: 12 },
  noPhone: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
