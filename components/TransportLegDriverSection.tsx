import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import {
  formatDriverLanguages,
  matchingDriverVehicleLine,
  type DriverTargetMode,
} from '../lib/driverMatchingDisplay';
import { fetchMatchingDrivers, type MatchingDriver } from '../lib/drivers';
import { legPassengers, type TransportLegDraft } from '../lib/transportPlan';
import type { RequestedDriverCategory } from '../lib/driverCategory';
import {
  normalizeVehicleClass,
  normalizeVehicleType,
} from '../lib/vehicleCatalog';
import { NameWithVerifiedBadge } from './NameWithVerifiedBadge';
import { UserAvatar } from './UserAvatar';

type Props = {
  leg: TransportLegDraft;
  onChange: (patch: Partial<TransportLegDraft>) => void;
  cityHint?: string | null;
  requiredLanguages: string[];
  driverCategory: RequestedDriverCategory;
};

export function TransportLegDriverSection({
  leg,
  onChange,
  cityHint,
  requiredLanguages,
  driverCategory,
}: Props) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterByMinSeats, setFilterByMinSeats] = useState(true);

  const normType = normalizeVehicleType(leg.vehicle_type);
  const normClass = normalizeVehicleClass(leg.vehicle_class);
  const minPax = legPassengers(leg);
  const mode = leg.driver_target_mode ?? 'all';

  useEffect(() => {
    if (!normType || !normClass) {
      setDrivers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void fetchMatchingDrivers(
      leg.vehicle_type,
      leg.vehicle_class,
      requiredLanguages,
      cityHint?.trim() || null,
      driverCategory,
      filterByMinSeats && minPax > 0 ? minPax : null,
      { sortMode: mode === 'all' ? 'rating' : 'name' },
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          setDrivers([]);
          return;
        }
        const list = Array.isArray(data) ? data : [];
        setDrivers(list);
        if (list.length === 0) {
          onChange({
            driver_target_mode: 'all',
            driver_id: null,
            driver_name: null,
            driver_vehicle_id: null,
          });
        } else if (leg.driver_id && !list.some((d) => d?.id === leg.driver_id)) {
          onChange({
            driver_id: null,
            driver_name: null,
            driver_vehicle_id: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(err instanceof Error ? err.message : t('common.error'));
        setDrivers([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange stable; leg.driver_id checked when drivers load
  }, [
    leg.vehicle_type,
    leg.vehicle_class,
    normType,
    normClass,
    requiredLanguages,
    cityHint,
    driverCategory,
    minPax,
    filterByMinSeats,
    mode,
    t,
  ]);

  const setMode = (next: DriverTargetMode) => {
    if (next === 'all') {
      onChange({
        driver_target_mode: 'all',
        driver_id: null,
        driver_name: null,
        driver_vehicle_id: null,
      });
    } else {
      onChange({ driver_target_mode: 'specific' });
    }
  };

  const driverCountLabel = loading ? '…' : String(drivers.length);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('newBooking.drivers')}</Text>

      {minPax > 0 ? (
        <Pressable
          onPress={() => setFilterByMinSeats(!filterByMinSeats)}
          style={[styles.filterRow, filterByMinSeats && styles.filterRowActive]}
        >
          <View style={[styles.radioOuter, filterByMinSeats && styles.radioOuterActive]}>
            {filterByMinSeats ? <View style={styles.radioInner} /> : null}
          </View>
          <Text style={styles.filterLabel}>{t('newBooking.filterMinSeats', { count: minPax })}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.empty}>{loadError}</Text>
      ) : drivers.length === 0 ? (
        <View style={styles.noMatchBox}>
          <Text style={styles.noMatchTitle}>{t('newBooking.noDriversTitle')}</Text>
          <Text style={styles.noMatchBody}>{t('newBooking.noDriversBody')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.targetRow}>
            <Pressable
              onPress={() => setMode('all')}
              style={[styles.targetOption, mode === 'all' && styles.targetOptionActive]}
            >
              <View style={[styles.radioOuter, mode === 'all' && styles.radioOuterActive]}>
                {mode === 'all' ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={[styles.targetLabel, mode === 'all' && styles.targetLabelActive]}>
                {t('newBooking.sendToAll')}{' '}
                <Text style={styles.countBadge}>
                  {t('newBooking.driverCount', { count: driverCountLabel })}
                </Text>
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('specific')}
              style={[styles.targetOption, mode === 'specific' && styles.targetOptionActive]}
            >
              <View style={[styles.radioOuter, mode === 'specific' && styles.radioOuterActive]}>
                {mode === 'specific' ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={[styles.targetLabel, mode === 'specific' && styles.targetLabelActive]}>
                {t('newBooking.selectDriver')}
              </Text>
            </Pressable>
          </View>

          {mode === 'specific'
            ? drivers.map((driver) => {
                if (!driver?.id) return null;
                const selected = leg.driver_id === driver.id;
                const vehicleLine = matchingDriverVehicleLine(driver.vehicle, (count) =>
                  t('newBooking.vehicleSeats', { count }),
                );
                const langs = formatDriverLanguages(driver.languages ?? []);
                const ratingCount = Number(driver.rating_count) || 0;
                const ratingLine =
                  driver.rating != null
                    ? `⭐ ${driver.rating}${ratingCount > 0 ? ` (${ratingCount})` : ''}`
                    : '⭐ —';
                return (
                  <Pressable
                    key={driver.id}
                    onPress={() =>
                      onChange(
                        selected
                          ? {
                              driver_id: null,
                              driver_name: null,
                              driver_vehicle_id: null,
                            }
                          : {
                              driver_id: driver.id,
                              driver_name: driver.full_name ?? driver.id.slice(0, 8),
                              driver_vehicle_id: driver.vehicle?.id ?? null,
                            },
                      )
                    }
                    style={[styles.driverCard, selected && styles.driverCardSelected]}
                  >
                    <View style={styles.driverCardTop}>
                      <UserAvatar name={driver.full_name} uri={driver.avatar_url} size={44} />
                      <View style={styles.driverCardMain}>
                        <NameWithVerifiedBadge
                          name={driver.full_name || t('driver.defaultName')}
                          verified={driver.is_verified}
                          isGuide={driver.is_guide_driver}
                          textStyle={styles.driverName}
                          numberOfLines={1}
                        />
                        {vehicleLine ? (
                          <Text style={styles.driverMeta} numberOfLines={2}>
                            {vehicleLine}
                          </Text>
                        ) : null}
                        <Text style={styles.driverMeta}>{ratingLine}</Text>
                        {langs ? <Text style={styles.driverMeta}>{langs}</Text> : null}
                      </View>
                      {driver.vehicle?.photo_front ? (
                        <Image
                          source={{ uri: driver.vehicle.photo_front }}
                          style={styles.vehicleThumb}
                          resizeMode="cover"
                        />
                      ) : null}
                    </View>
                    <View style={[styles.chooseBtn, selected && styles.chooseBtnSelected]}>
                      <Text style={[styles.chooseBtnText, selected && styles.chooseBtnTextSelected]}>
                        {selected ? t('newBooking.selected') : t('newBooking.choose')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.sm },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    marginBottom: SPACING.sm,
  },
  filterRowActive: {},
  filterLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  loader: { marginVertical: SPACING.sm },
  empty: { fontSize: 13, color: COLORS.error, marginBottom: SPACING.sm },
  noMatchBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  noMatchTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  noMatchBody: { fontSize: 13, color: COLORS.textSecondary },
  targetRow: { gap: 8, marginBottom: SPACING.sm },
  targetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  targetOptionActive: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  targetLabel: { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  targetLabelActive: { color: COLORS.text, fontWeight: '600' },
  countBadge: { fontWeight: '700', color: COLORS.goldDark },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: COLORS.gold },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.gold },
  driverCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  driverCardSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  driverCardTop: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  driverCardMain: { flex: 1, minWidth: 0 },
  driverName: { fontSize: 15, fontWeight: '700' },
  driverMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  vehicleThumb: { width: 48, height: 36, borderRadius: 6, backgroundColor: COLORS.surfaceAlt },
  chooseBtn: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  chooseBtnSelected: { backgroundColor: COLORS.gold },
  chooseBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  chooseBtnTextSelected: { color: COLORS.white },
});
