import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import {
  fetchImportLog,
  formatFileSize,
  type ImportLogRow,
  type ImportLogTotals,
} from '../../lib/adminImportLog';
import { adminStyles } from './adminStyles';

function timeLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function AdminImportLogSection({ searchQuery = '' }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ImportLogRow[]>([]);
  const [totals, setTotals] = useState<ImportLogTotals>({ total: 0, ok: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchImportLog();
      if (res.error) {
        setError(res.error.message);
        setRows([]);
        return;
      }
      setRows(res.data);
      setTotals(res.totals);
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
    return rows.filter((r) => {
      if (failedOnly && r.status === 'ok') return false;
      if (!q) return true;
      return [r.companyName ?? '', r.file_name ?? '', r.error ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, searchQuery, failedOnly]);

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

  return (
    <View>
      <View style={styles.totalsCard}>
        <Text style={styles.totalsLine}>
          {t('adminImportLog.totals', {
            total: totals.total,
            ok: totals.ok,
            failed: totals.failed,
          })}
        </Text>
        <Pressable
          onPress={() => setFailedOnly((v) => !v)}
          style={({ pressed }) => [
            styles.filterChip,
            failedOnly && styles.filterChipOn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.filterChipText, failedOnly && styles.filterChipTextOn]}>
            {failedOnly ? t('adminImportLog.showAll') : t('adminImportLog.showFailed')}
          </Text>
        </Pressable>
      </View>

      {filtered.length === 0 ? (
        <Text style={adminStyles.empty}>
          {rows.length > 0 ? t('adminVerify.emptySearch') : t('adminImportLog.empty')}
        </Text>
      ) : null}

      {filtered.map((r) => {
        const open = openId === r.id;
        const bad = r.status !== 'ok';
        return (
          <Pressable
            key={r.id}
            onPress={() => setOpenId(open ? null : r.id)}
            style={({ pressed }) => [
              adminStyles.card,
              bad && styles.cardBad,
              pressed && styles.pressed,
            ]}
          >
            <Text style={adminStyles.cardTitle} numberOfLines={2}>
              {r.file_name?.trim() || '—'}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {timeLabel(r.created_at)}
              {r.companyName ? ` · ${r.companyName}` : ''}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {formatFileSize(r.file_bytes)}
              {r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : ''}
              {r.used_ai ? ` · ${t('adminImportLog.usedAi')}` : ''}
            </Text>

            <View style={[adminStyles.badge, bad && adminStyles.badgeDanger]}>
              <Text style={[adminStyles.badgeText, bad && adminStyles.badgeDangerText]}>
                {r.status === 'ok'
                  ? t('adminImportLog.statusOk', { count: r.service_count })
                  : r.status === 'empty'
                    ? t('adminImportLog.statusEmpty')
                    : t('adminImportLog.statusError')}
              </Text>
            </View>

            {r.error?.trim() ? <Text style={styles.errLine}>{r.error.trim()}</Text> : null}

            {open && r.warnings.length > 0 ? (
              <View style={styles.drill}>
                <Text style={styles.drillLabel}>{t('adminImportLog.warnings')}</Text>
                {r.warnings.map((w, i) => (
                  <Text key={`${r.id}-w${i}`} style={styles.drillText}>
                    • {w}
                  </Text>
                ))}
              </View>
            ) : null}
            {open && r.warnings.length === 0 ? (
              <Text style={styles.drillEmpty}>{t('adminImportLog.noWarnings')}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  totalsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },
  totalsLine: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filterChipOn: {
    borderColor: COLORS.error,
    backgroundColor: 'rgba(244, 67, 54, 0.08)',
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextOn: {
    color: COLORS.error,
  },
  cardBad: {
    borderColor: COLORS.error,
  },
  errLine: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  drill: {
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  drillLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  drillText: {
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
