import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import { fetchDispatchLog, type DispatchLogRow } from '../../lib/adminDispatchLog';
import { regionLabel } from '../../lib/georgiaRegions';
import { adminStyles } from './adminStyles';

function timeLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function AdminDispatchLogSection({ searchQuery = '' }: { searchQuery?: string }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<DispatchLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchDispatchLog();
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows(data);
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.companyName ?? '',
        r.from_location ?? '',
        r.to_location ?? '',
        r.winnerName ?? '',
        ...r.wave1Names,
        ...r.wave2Names,
        ...r.regions.map((c) => regionLabel(c, i18n.language)),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery, i18n.language]);

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

  if (filtered.length === 0) {
    return (
      <Text style={adminStyles.empty}>
        {rows.length > 0 ? t('adminVerify.emptySearch') : t('adminDispatchLog.empty')}
      </Text>
    );
  }

  return (
    <View>
      <Text style={styles.hint}>{t('adminDispatchLog.hint')}</Text>
      {filtered.map((r) => {
        const open = openId === r.id;
        const route =
          [r.from_location?.trim(), r.to_location?.trim()].filter(Boolean).join(' → ') || '—';
        return (
          <Pressable
            key={r.id}
            onPress={() => setOpenId(open ? null : r.id)}
            style={({ pressed }) => [adminStyles.card, pressed && styles.pressed]}
          >
            <Text style={adminStyles.cardTitle} numberOfLines={2}>
              {route}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {timeLabel(r.created_at)}
              {r.companyName ? ` · ${r.companyName}` : ''}
            </Text>
            {r.regions.length > 0 ? (
              <Text style={adminStyles.cardMeta}>
                {t('adminDispatchLog.regions')}:{' '}
                {r.regions.map((c) => regionLabel(c, i18n.language)).join(', ')}
              </Text>
            ) : (
              <Text style={adminStyles.cardMeta}>{t('adminDispatchLog.noRegion')}</Text>
            )}
            <Text style={adminStyles.cardMeta}>
              {t('adminDispatchLog.waves', {
                wave1: r.wave1_driver_ids.length,
                wave2: r.wave2_driver_ids.length,
              })}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminDispatchLog.push', { sent: r.wave1_sent, failed: r.wave1_failed })}
            </Text>

            {r.winnerName ? (
              <View style={[adminStyles.badge, r.wonFromWave2 && styles.badgeWave2]}>
                <Text style={[adminStyles.badgeText, r.wonFromWave2 && styles.badgeWave2Text]}>
                  {r.wonFromWave2
                    ? t('adminDispatchLog.wonFromWave2', { name: r.winnerName })
                    : t('adminDispatchLog.wonFromWave1', { name: r.winnerName })}
                </Text>
              </View>
            ) : (
              <View style={[adminStyles.badge, adminStyles.badgeDanger]}>
                <Text style={[adminStyles.badgeText, adminStyles.badgeDangerText]}>
                  {r.bookingStatus === 'pending'
                    ? t('adminDispatchLog.stillOpen')
                    : (r.bookingStatus ?? t('adminDispatchLog.bookingGone'))}
                </Text>
              </View>
            )}

            {open ? (
              <View style={styles.drill}>
                <Text style={styles.drillLabel}>{t('adminDispatchLog.wave1List')}</Text>
                <Text style={styles.drillText}>{r.wave1Names.join(', ') || '—'}</Text>
                <Text style={[styles.drillLabel, { marginTop: SPACING.sm }]}>
                  {t('adminDispatchLog.wave2List')}
                </Text>
                <Text style={styles.drillText}>{r.wave2Names.join(', ') || '—'}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  badgeWave2: {
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
  },
  badgeWave2Text: {
    color: '#1565c0',
  },
  drill: {
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  drillLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  drillText: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
  },
});
