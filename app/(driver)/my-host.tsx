import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { APP_HEADER_BODY_HEIGHT } from '../../constants/layout';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { fetchFleetContext, type FleetSubContext } from '../../lib/fleet';
import { isHiredDriver } from '../../lib/role';

export default function MyHostScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ctx, setCtx] = useState<FleetSubContext | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!user?.id || !isHiredDriver(profile)) {
        setLoading(false);
        setRefreshing(false);
        setCtx(null);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      const fleet = await fetchFleetContext(user.id);
      setCtx(fleet.kind === 'sub' ? fleet : null);
      setLoading(false);
      setRefreshing(false);
    },
    [user?.id, profile],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + APP_HEADER_BODY_HEIGHT + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load('refresh')}
          tintColor={COLORS.gold}
          colors={[COLORS.gold]}
        />
      }
    >
      <Text style={styles.title}>{t('menu.myHost')}</Text>
      {loading ? (
        <ActivityIndicator color={COLORS.gold} />
      ) : ctx ? (
        <View style={[styles.card, SHADOWS.card]}>
          <Text style={styles.label}>{t('menu.hostEmployer')}</Text>
          <Text style={styles.value}>{ctx.hostName?.trim() || '—'}</Text>
          <Pressable
            onPress={() => router.push('/(driver)/assigned-vehicle')}
            style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}
          >
            <Text style={styles.linkBtnText}>{t('menu.assignedVehicle')}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.empty}>{t('menu.noHostAssigned')}</Text>
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
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  label: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  value: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  empty: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  linkBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.goldTint,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    alignItems: 'center',
  },
  linkBtnPressed: { opacity: 0.88 },
  linkBtnText: { fontWeight: '700', color: COLORS.goldDark },
});
