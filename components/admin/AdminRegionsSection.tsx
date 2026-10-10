import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import {
  driversEverywhere,
  driversForRegion,
  fetchRegionCoverage,
  type AdminRegionDriver,
  type RegionCoverageSummary,
} from '../../lib/adminRegions';
import { regionLabel, type GeorgiaRegionCode } from '../../lib/georgiaRegions';
import { adminStyles } from './adminStyles';

type Expanded = GeorgiaRegionCode | 'everywhere' | null;

export function AdminRegionsSection({ searchQuery = '' }: { searchQuery?: string }) {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<RegionCoverageSummary | null>(null);
  const [drivers, setDrivers] = useState<AdminRegionDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Expanded>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRegionCoverage();
      if (res.error) {
        setError(res.error.message);
        setSummary(null);
        setDrivers([]);
        return;
      }
      setSummary(res.data);
      setDrivers(res.drivers);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const query = searchQuery.trim().toLowerCase();

  const rows = useMemo(() => {
    if (!summary) return [];
    if (!query) return summary.rows;
    return summary.rows.filter((r) =>
      regionLabel(r.code, i18n.language).toLowerCase().includes(query),
    );
  }, [summary, query, i18n.language]);

  function driverLine(d: AdminRegionDriver): string {
    const bits = [d.full_name?.trim() || d.phone?.trim() || '—'];
    if (d.current_city?.trim()) bits.push(d.current_city.trim());
    bits.push(
      d.is_available === true
        ? t('adminRegions.driverAvailable')
        : t('adminRegions.driverUnavailable'),
    );
    return bits.join(' · ');
  }

  function renderDriverList(list: AdminRegionDriver[]) {
    if (list.length === 0) {
      return <Text style={styles.drillEmpty}>{t('adminRegions.noDrivers')}</Text>;
    }
    return (
      <View style={styles.drill}>
        {list.map((d) => (
          <Text key={d.id} style={styles.drillRow} numberOfLines={1}>
            {driverLine(d)}
          </Text>
        ))}
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />;
  }

  if (error) {
    return (
      <View style={adminStyles.errBox}>
        <Text style={adminStyles.errText}>{error}</Text>
        <Pressable onPress={() => void load()} style={adminStyles.retry}>
          <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!summary) {
    return <Text style={adminStyles.empty}>{t('adminRegions.empty')}</Text>;
  }

  // With the booking counts missing, "open work" is unknown, so an uncovered
  // region is reported on its own rather than silently passing the filter.
  const gaps = summary.bookingsError
    ? summary.rows.filter((r) => r.declared === 0)
    : summary.rows.filter((r) => r.declared === 0 && r.openBookings > 0);

  return (
    <View>
      <View style={styles.totalsCard}>
        <Text style={styles.totalsTitle}>{t('adminRegions.totalsTitle')}</Text>
        <Text style={styles.totalsLine}>
          {t('adminRegions.totalDrivers', { count: summary.totalDrivers })}
        </Text>
        <Pressable
          onPress={() => setExpanded(expanded === 'everywhere' ? null : 'everywhere')}
          style={({ pressed }) => [styles.totalsPress, pressed && styles.pressed]}
        >
          <Text style={styles.totalsLink}>
            {t('adminRegions.everywhere', {
              count: summary.everywhere,
              available: summary.everywhereAvailable,
            })}
          </Text>
        </Pressable>
        <Text style={styles.totalsLine}>
          {t('adminRegions.countrywideTour', { count: summary.countrywideTour })}
        </Text>
        {summary.unresolvedBookings > 0 ? (
          <Text style={styles.totalsHint}>
            {t('adminRegions.unresolvedBookings', { count: summary.unresolvedBookings })}
          </Text>
        ) : null}
        {summary.bookingsError ? (
          <Text style={styles.totalsWarn}>{t('adminRegions.bookingsUnavailable')}</Text>
        ) : null}
        {summary.bookingsTruncated ? (
          <Text style={styles.totalsHint}>
            {t('adminRegions.bookingsTruncated', { count: summary.rows.length })}
          </Text>
        ) : null}
        {expanded === 'everywhere' ? renderDriverList(driversEverywhere(drivers)) : null}
      </View>

      {gaps.length > 0 ? (
        <View style={styles.warnCard}>
          <View style={styles.warnHead}>
            <Ionicons name="warning-outline" size={18} color={COLORS.error} />
            <Text style={styles.warnTitle}>{t('adminRegions.gapTitle')}</Text>
          </View>
          <Text style={styles.warnText}>
            {gaps.map((r) => regionLabel(r.code, i18n.language)).join(', ')}
          </Text>
          <Text style={styles.warnHint}>{t('adminRegions.gapHint')}</Text>
        </View>
      ) : null}

      {rows.map((r) => {
        const open = expanded === r.code;
        const uncovered = r.declared === 0;
        return (
          <Pressable
            key={r.code}
            onPress={() => setExpanded(open ? null : r.code)}
            style={({ pressed }) => [
              styles.regionCard,
              uncovered && styles.regionCardGap,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.regionHead}>
              <Text style={styles.regionName} numberOfLines={2}>
                {regionLabel(r.code, i18n.language)}
              </Text>
              <View style={[styles.countPill, uncovered && styles.countPillGap]}>
                <Text style={[styles.countPillText, uncovered && styles.countPillTextGap]}>
                  {r.declared}
                </Text>
              </View>
            </View>
            <Text style={styles.regionMeta}>
              {t('adminRegions.availableNow', { count: r.available })}
              {r.tourReady > 0 ? ` · ${t('adminRegions.tourReady', { count: r.tourReady })}` : ''}
            </Text>
            <Text style={[styles.regionMeta, r.openBookings > 0 && styles.regionMetaBusy]}>
              {t('adminRegions.openBookings', { count: r.openBookings })}
            </Text>
            {uncovered ? (
              <Text style={styles.regionGapNote}>{t('adminRegions.uncoveredNote')}</Text>
            ) : null}
            {open ? renderDriverList(driversForRegion(drivers, r.code)) : null}
          </Pressable>
        );
      })}

      {rows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminVerify.emptySearch')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9 },
  totalsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  totalsTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  totalsLine: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  totalsPress: { paddingVertical: 2 },
  totalsLink: {
    color: COLORS.goldDark,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  totalsHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  totalsWarn: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  warnCard: {
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  warnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  warnTitle: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '800',
  },
  warnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  warnHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  regionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  regionCardGap: {
    borderColor: COLORS.error,
  },
  regionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  regionName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  countPill: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
  },
  countPillGap: {
    backgroundColor: 'rgba(244, 67, 54, 0.14)',
  },
  countPillText: {
    color: COLORS.goldDark,
    fontSize: 14,
    fontWeight: '800',
  },
  countPillTextGap: {
    color: COLORS.error,
  },
  regionMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  regionMetaBusy: {
    color: COLORS.goldDark,
    fontWeight: '700',
  },
  regionGapNote: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '600',
  },
  drill: {
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    gap: 2,
  },
  drillRow: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
  },
  drillEmpty: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: SPACING.sm,
  },
});
