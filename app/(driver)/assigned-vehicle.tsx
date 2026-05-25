import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { APP_HEADER_BODY_HEIGHT } from '../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { fetchFleetContext, type FleetSubContext } from '../../lib/fleet';
import { withCacheBust } from '../../lib/mediaUpload';
import { isHiredDriver } from '../../lib/role';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
} from '../../lib/vehicleCatalog';

export default function AssignedVehicleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<FleetSubContext | null>(null);

  useEffect(() => {
    if (!user?.id || !isHiredDriver(profile)) {
      setLoading(false);
      setCtx(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const fleet = await fetchFleetContext(user.id);
      if (!cancelled) {
        setCtx(fleet.kind === 'sub' ? fleet : null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile]);

  const v = ctx?.vehicle;
  const photo = v?.photo_front ? withCacheBust(v.photo_front) : null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text style={styles.title}>{t('menu.assignedVehicle')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} />
      ) : v ? (
        <View style={[styles.card, SHADOWS.card]}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
          ) : null}
          <Text style={styles.line}>
            {[v.model?.trim(), v.plate?.trim()].filter(Boolean).join(' · ') || '—'}
          </Text>
          <Text style={styles.meta}>
            {[
              v.type ? vehicleTypeLabel(v.type) : null,
              v.class ? vehicleClassLabel(v.class) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {ctx?.hostName ? (
            <Text style={styles.host}>
              {t('menu.hostEmployer')}: {ctx.hostName}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.empty}>{t('menu.noAssignedVehicle')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.md },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.surfaceAlt,
  },
  line: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  meta: { fontSize: 14, color: COLORS.textSecondary },
  host: { fontSize: 13, color: COLORS.textSecondary, marginTop: SPACING.xs },
  empty: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
});
