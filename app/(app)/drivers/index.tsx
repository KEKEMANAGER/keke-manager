import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../../components/EmptyState';
import { StarRow } from '../../../components/StarRow';
import { APP_HEADER_BODY_HEIGHT } from '../../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../../constants/theme';
import { fetchMatchingDrivers, type MatchingDriver } from '../../../lib/drivers';
import { withCacheBust } from '../../../lib/mediaUpload';
import { VEHICLE_CLASSES, VEHICLE_TYPES } from '../../../lib/vehicleCatalog';

export default function CompanyDriversScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [drivers, setDrivers] = useState<MatchingDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchMatchingDrivers(
      VEHICLE_TYPES[0],
      VEHICLE_CLASSES[1] ?? 'comfort',
      null,
      null,
      'all',
      null,
      { sortMode: 'rating' },
    );
    if (!error) setDrivers(data);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        {
          paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md,
          paddingBottom: insets.bottom + SPACING.xl,
          flexGrow: 1,
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <Text style={styles.title}>{t('menu.drivers')}</Text>
      <Text style={styles.sub}>{t('menu.driversHint')}</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : drivers.length === 0 ? (
        <EmptyState icon="people" title={t('menu.driversEmpty')} subtitle={t('menu.driversEmptyHint')} />
      ) : (
        drivers.map((d) => {
          const name = d.full_name?.trim() || t('common.driver');
          const avatar = d.avatar_url ? withCacheBust(d.avatar_url) ?? d.avatar_url : null;
          const rating = d.rating ? Number.parseFloat(d.rating) : 0;
          const vehicleLine = d.vehicle
            ? [
                d.vehicle.model?.trim(),
                d.vehicle.year ? String(d.vehicle.year) : null,
                d.vehicle.plate?.trim(),
              ]
                .filter(Boolean)
                .join(' · ')
            : null;
          return (
            <Pressable
              key={d.id}
              onPress={() =>
                router.push({
                  pathname: '/(app)/drivers/[id]',
                  params: { id: d.id },
                })
              }
              style={({ pressed }) => [styles.card, SHADOWS.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPh}>
                    <Text style={styles.avatarPhText}>{(name[0] ?? '?').toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.cardMain}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {d.city?.trim() ? <Text style={styles.city}>{d.city.trim()}</Text> : null}
                  <View style={styles.ratingRow}>
                    <StarRow value={rating} size={14} />
                    <Text style={styles.ratingMeta}>
                      {d.rating_count > 0
                        ? `${rating.toFixed(1)} (${d.rating_count})`
                        : t('jobBoard.noRatings')}
                    </Text>
                  </View>
                </View>
              </View>
              {vehicleLine ? <Text style={styles.vehicle}>{vehicleLine}</Text> : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  cardPressed: { opacity: 0.92 },
  cardTop: { flexDirection: 'row', gap: SPACING.md },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPh: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhText: { fontWeight: '800', color: COLORS.goldDark },
  cardMain: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  city: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingMeta: { fontSize: 12, color: COLORS.textSecondary },
  vehicle: { fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.sm },
});
