import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import {
  fetchAdminVehicleVerificationQueue,
  vehiclePhotosDueDate,
  vehiclePhotosOverdue,
  type AdminVehicleVerificationRow,
} from '../../lib/vehicleVerification';
import { adminStyles } from './adminStyles';

const PHOTO_SLOTS: { column: keyof AdminVehicleVerificationRow; labelKey: string }[] = [
  { column: 'photo_front', labelKey: 'vehicleScreen.photoFront' },
  { column: 'photo_left', labelKey: 'vehicleScreen.photoLeft' },
  { column: 'photo_right', labelKey: 'vehicleScreen.photoRight' },
  { column: 'photo_interior', labelKey: 'vehicleScreen.photoInterior' },
  { column: 'photo_rear', labelKey: 'vehicleScreen.photoRear' },
];

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function AdminVehiclePhotoAuditSection({ searchQuery = '' }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminVehicleVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminVehicleVerificationQueue();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setRows(data.filter((v) => PHOTO_SLOTS.some((s) => !!v[s.column])));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredRows = useMemo(() => {
    const withStatus = rows.map((v) => ({
      vehicle: v,
      overdue: vehiclePhotosOverdue(v),
      dueDate: vehiclePhotosDueDate(v),
    }));
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? withStatus.filter(({ vehicle: v }) => {
          const name = (v.driver_name ?? '').toLowerCase();
          const email = (v.driver_email ?? '').toLowerCase();
          const plate = (v.plate ?? '').toLowerCase();
          const model = (v.model ?? '').toLowerCase();
          return name.includes(q) || email.includes(q) || plate.includes(q) || model.includes(q);
        })
      : withStatus;
    return filtered.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const at = a.dueDate?.getTime() ?? Infinity;
      const bt = b.dueDate?.getTime() ?? Infinity;
      return at - bt;
    });
  }, [rows, searchQuery]);

  if (loading) {
    return <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.lg }} size="large" />;
  }

  return (
    <>
      <Text style={styles.subtitle}>{t('adminVehicleVerify.photoAuditSubtitle')}</Text>

      {error ? (
        <View style={adminStyles.errBox}>
          <Text style={adminStyles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={adminStyles.retry}>
            <Text style={adminStyles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {filteredRows.length === 0 ? (
        <Text style={adminStyles.empty}>{t('adminVehicleVerify.photoAuditEmpty')}</Text>
      ) : (
        filteredRows.map(({ vehicle: v, overdue, dueDate }) => (
          <View key={v.id} style={adminStyles.card}>
            <Text style={adminStyles.cardTitle}>
              {v.plate?.trim() || v.model?.trim() || v.id.slice(0, 8)}
            </Text>
            <Text style={adminStyles.cardMeta}>
              {t('adminVehicleVerify.driver')}: {v.driver_name?.trim() || v.driver_email || '—'}
            </Text>

            <View style={[adminStyles.badge, overdue && adminStyles.badgeDanger, styles.statusBadge]}>
              <Text style={[adminStyles.badgeText, overdue && adminStyles.badgeDangerText]}>
                {overdue
                  ? t('adminVehicleVerify.photoOverdueBadge')
                  : dueDate
                    ? t('adminVehicleVerify.photoDueBadge', { date: formatDate(dueDate) })
                    : t('adminVehicleVerify.photoNoMetaBadge')}
              </Text>
            </View>

            <View style={styles.photoGrid}>
              {PHOTO_SLOTS.map((slot) => {
                const url = v[slot.column] as string | null;
                return (
                  <Pressable
                    key={slot.column}
                    disabled={!url}
                    onPress={() => url && setPreview({ url, title: t(slot.labelKey) })}
                    style={({ pressed }) => [
                      styles.thumbWrap,
                      !url && styles.thumbWrapEmpty,
                      pressed && url && styles.thumbWrapPressed,
                    ]}
                  >
                    {url ? (
                      <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <Text style={styles.thumbEmptyText}>—</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{preview?.title}</Text>
            {preview?.url ? (
              <Image
                source={{ uri: preview.url }}
                style={styles.previewImage}
                resizeMode="contain"
                onError={() => setPreview(null)}
              />
            ) : null}
            <Pressable onPress={() => setPreview(null)} style={styles.previewClose}>
              <Text style={styles.previewCloseText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  statusBadge: { alignSelf: 'flex-start', marginTop: 4, marginBottom: SPACING.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbWrapEmpty: { opacity: 0.4 },
  thumbWrapPressed: { opacity: 0.8, borderColor: COLORS.gold },
  thumb: { width: '100%', height: '100%' },
  thumbEmptyText: { color: COLORS.textMuted, fontSize: 18 },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING.md,
    maxHeight: '90%',
  },
  previewTitle: { color: COLORS.text, fontWeight: '700', marginBottom: SPACING.sm },
  previewImage: { width: '100%', height: 360 },
  previewClose: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
  },
  previewCloseText: { fontWeight: '800', color: '#0f0f0f' },
});
