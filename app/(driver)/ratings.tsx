import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StarRow } from '../../components/StarRow';
import { APP_HEADER_BODY_HEIGHT } from '../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { fetchDriverAverageRating } from '../../lib/ratings';

export default function DriverRatingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchDriverAverageRating(user.id);
      if (!cancelled) {
        setAverage(res.average);
        setCount(res.count);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
    >
      <Text style={styles.title}>{t('menu.ratings')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : (
        <View style={[styles.card, SHADOWS.card]}>
          <StarRow value={average} size={28} />
          <Text style={styles.avg}>{average > 0 ? average.toFixed(1) : '—'}</Text>
          <Text style={styles.meta}>
            {t('menu.ratingsCount', { count })}
          </Text>
        </View>
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
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avg: { fontSize: 36, fontWeight: '900', color: COLORS.goldDark },
  meta: { fontSize: 14, color: COLORS.textSecondary },
});
