import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { fetchAdminStats, type AdminStats } from '../../lib/adminPanel';
import { adminStyles } from './adminStyles';

function formatGel(n: number): string {
  return `${n.toFixed(2)} ₾`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function AdminStatsSection() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchAdminStats();
      if (err) {
        setError(err.message);
        setStats(null);
        return;
      }
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  if (!stats) return null;

  return (
    <View>
      <View style={styles.grid}>
        <StatTile label={t('adminPanel.statUsers')} value={stats.totalUsers} />
        <StatTile label={t('adminPanel.statDrivers')} value={stats.drivers} />
        <StatTile label={t('adminPanel.statHired')} value={stats.hiredDrivers} />
        <StatTile label={t('adminPanel.statCompanies')} value={stats.companies} />
        <StatTile label={t('adminPanel.statBookings')} value={stats.bookingsTotal} />
        <StatTile label={t('adminPanel.statCompleted')} value={stats.bookingsCompleted} />
        <StatTile label={t('adminPanel.statRevenue')} value={formatGel(stats.revenueGel)} />
        <StatTile label={t('adminPanel.statPendingVerify')} value={stats.pendingVerifications} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOWS.card,
  },
  tileValue: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  tileLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
});
