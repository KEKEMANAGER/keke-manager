import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BookingRow } from '../../lib/bookings';
import { fetchAdminBookings } from '../../lib/adminPanel';
import { COLORS, SPACING } from '../../constants/theme';
import { adminStyles } from './adminStyles';

function formatGel(n: number): string {
  return `${n.toFixed(2)} ₾`;
}

function statusLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    pending: t('tracking.statusPending'),
    accepted: t('tracking.statusAccepted'),
    in_progress: t('tracking.statusInProgress'),
    completed: t('adminPanel.statusCompleted'),
    cancelled: t('adminPanel.statusCancelled'),
    rejected: t('adminPanel.statusRejected'),
  };
  return map[status] ?? status;
}

export function AdminBookingsSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminBookings();
    setLoading(false);
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} size="large" />;
  }

  return (
    <View>
      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminPanel.bookingsEmpty')}</Text>
      ) : (
        rows.map((b) => (
          <View key={String(b.id)} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle} numberOfLines={2}>
              {b.route ??
                [b.from_location, b.to_location].filter(Boolean).join(' → ') ||
                t('adminPanel.bookingUntitled')}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {statusLabel(String(b.status), t)} · {formatGel(Number(b.price_gel) || 0)}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminPanel.bookingKind')}: {String(b.kind ?? '—')}
            </Text>
            {b.date_display ? (
              <Text style={adminStyles.cardMeta}>
                {t('adminPanel.bookingWhen')}: {b.date_display}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}
