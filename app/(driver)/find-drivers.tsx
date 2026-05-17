import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StarRow } from '../../components/StarRow';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { assignSubDriverToVehicle } from '../../lib/fleet';
import {
  fetchHiredDriversForBoard,
  JOB_BOARD_LANG_CODES,
  languageBadgeLabel,
  notifyJobBoardProfileViewed,
  type HiredDriverListing,
  type JobBoardLangCode,
} from '../../lib/jobBoard';
import { withCacheBust } from '../../lib/mediaUpload';
import { isHiredDriver } from '../../lib/role';
import { fetchVehiclesByDriver, type VehicleRow } from '../../lib/vehicles';
import { useAuth } from '../../contexts/AuthContext';

type StatusFilter = 'looking' | 'all';

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && styles.filterChipPressed,
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DriverCard({
  driver,
  onViewProfile,
  onAdd,
  busy,
}: {
  driver: HiredDriverListing;
  onViewProfile: () => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const name = driver.full_name?.trim() || driver.email || t('common.driver');
  const avatarUri = driver.avatar_url ? withCacheBust(driver.avatar_url) ?? driver.avatar_url : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPh}>
            <Text style={styles.avatarPhText}>{(name[0] ?? '?').toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.cardMain}>
          <Text style={styles.cardName} numberOfLines={2}>
            {name}
          </Text>
          <View style={styles.ratingRow}>
            <StarRow value={driver.ratingAverage} size={15} />
            <Text style={styles.ratingMeta}>
              {driver.ratingCount > 0
                ? `${driver.ratingAverage.toFixed(1)} (${driver.ratingCount})`
                : t('jobBoard.noRatings')}
            </Text>
          </View>
          {!driver.available_for_hire ? (
            <View style={styles.statusPillMuted}>
              <Text style={styles.statusPillMutedText}>{t('jobBoard.statusNotLooking')}</Text>
            </View>
          ) : (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{t('jobBoard.statusLookingForWork')}</Text>
            </View>
          )}
        </View>
      </View>

      {driver.languageCodes.length > 0 ? (
        <View style={styles.langRow}>
          {driver.languageCodes.map((code) => (
            <View key={code} style={styles.langBadge}>
              <Text style={styles.langBadgeText}>{languageBadgeLabel(code)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {driver.bio ? (
        <Text style={styles.bio}>{driver.bio}</Text>
      ) : (
        <Text style={styles.bioMuted}>{t('jobBoard.noBio')}</Text>
      )}

      <View style={styles.cardActions}>
        <Pressable
          onPress={onViewProfile}
          style={({ pressed }) => [styles.btnOutline, pressed && styles.btnPressed]}
        >
          <Ionicons name="eye-outline" size={17} color={COLORS.text} />
          <Text style={styles.btnOutlineText}>{t('jobBoard.viewProfile')}</Text>
        </Pressable>
        <Pressable
          onPress={onAdd}
          disabled={busy}
          style={({ pressed }) => [
            styles.btnGold,
            SHADOWS.button,
            (pressed || busy) && styles.btnPressed,
            busy && styles.btnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={COLORS.black} size="small" />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={17} color={COLORS.black} />
              <Text style={styles.btnGoldText}>{t('jobBoard.addToFleet')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function FindDriversScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const userId = user?.id;

  const [drivers, setDrivers] = useState<HiredDriverListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [profileDriver, setProfileDriver] = useState<HiredDriverListing | null>(null);

  const [langFilters, setLangFilters] = useState<JobBoardLangCode[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('looking');

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!userId) {
        setDrivers([]);
        setLoading(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);

      const { data, error: err } = await fetchHiredDriversForBoard(userId, {
        onlyLooking: statusFilter === 'looking',
      });
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      if (err) {
        setError(err.message);
        setDrivers([]);
        return;
      }
      setDrivers(data);
    },
    [userId, statusFilter],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (minRating > 0) {
        if (d.ratingCount === 0 || d.ratingAverage < minRating) return false;
      }
      if (langFilters.length > 0) {
        const hasLang = langFilters.some((code) => d.languageCodes.includes(code));
        if (!hasLang) return false;
      }
      return true;
    });
  }, [drivers, minRating, langFilters]);

  function toggleLang(code: JobBoardLangCode) {
    setLangFilters((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function openProfile(driver: HiredDriverListing) {
    setProfileDriver(driver);
    const { error: notifyErr } = await notifyJobBoardProfileViewed(driver.id);
    if (notifyErr && __DEV__) {
      console.warn('[jobBoard] profile view notify:', notifyErr.message);
    }
  }

  async function assignToVehicle(subDriverId: string, vehicleId: string) {
    if (!userId) return;
    setAddingId(subDriverId);
    const { error: err } = await assignSubDriverToVehicle(userId, vehicleId, subDriverId);
    setAddingId(null);
    if (err) {
      Alert.alert(t('system.errorTitle'), err.message);
      return;
    }
    Alert.alert(t('common.success'), t('jobBoard.addSuccess'), [
      { text: t('jobBoard.viewFleet'), onPress: () => router.push('/(driver)/fleet') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
    void load('refresh');
  }

  function pickVehicleAndAdd(driver: HiredDriverListing, vehicles: VehicleRow[]) {
    const label = (v: VehicleRow) =>
      [v.model?.trim(), v.plate?.trim(), v.type].filter(Boolean).join(' · ') || v.id.slice(0, 8);

    if (vehicles.length === 1) {
      void assignToVehicle(driver.id, vehicles[0]!.id);
      return;
    }

    Alert.alert(
      t('jobBoard.pickVehicle'),
      t('jobBoard.pickVehicleSub'),
      [
        ...vehicles.map((v) => ({
          text: label(v),
          onPress: () => void assignToVehicle(driver.id, v.id),
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );
  }

  async function handleAdd(driver: HiredDriverListing) {
    if (!userId) return;
    const { data: vehicles, error: vErr } = await fetchVehiclesByDriver(userId);
    if (vErr) {
      Alert.alert(t('system.errorTitle'), vErr.message);
      return;
    }
    if (!vehicles.length) {
      Alert.alert(t('jobBoard.noVehiclesTitle'), t('jobBoard.noVehiclesBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('fleet.goToVehicles'),
          onPress: () => router.push('/(driver)/vehicle'),
        },
      ]);
      return;
    }
    pickVehicleAndAdd(driver, vehicles);
  }

  if (isHiredDriver(profile)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + SPACING.xl }]}>
        <Text style={styles.forbidden}>{t('jobBoard.hostOnly')}</Text>
      </View>
    );
  }

  const profileName =
    profileDriver?.full_name?.trim() || profileDriver?.email || t('common.driver');
  const profileAvatar = profileDriver?.avatar_url
    ? withCacheBust(profileDriver.avatar_url) ?? profileDriver.avatar_url
    : null;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + 96 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={COLORS.gold}
          />
        }
      >
        <Text style={styles.title}>{t('jobBoard.title')}</Text>
        <Text style={styles.sub}>{t('jobBoard.subtitle')}</Text>

        <View style={styles.filtersCard}>
          <Text style={styles.filterSectionTitle}>{t('jobBoard.filterLanguages')}</Text>
          <View style={styles.filterRow}>
            {JOB_BOARD_LANG_CODES.map((code) => (
              <FilterChip
                key={code}
                label={languageBadgeLabel(code)}
                active={langFilters.includes(code)}
                onPress={() => toggleLang(code)}
              />
            ))}
          </View>

          <Text style={styles.filterSectionTitle}>{t('jobBoard.filterRating')}</Text>
          <View style={styles.filterRow}>
            <FilterChip
              label={t('jobBoard.filterRatingAny')}
              active={minRating === 0}
              onPress={() => setMinRating(0)}
            />
            {[1, 2, 3, 4, 5].map((n) => (
              <FilterChip
                key={n}
                label={t('jobBoard.filterRatingMin', { count: n })}
                active={minRating === n}
                onPress={() => setMinRating(n)}
              />
            ))}
          </View>

          <Text style={styles.filterSectionTitle}>{t('jobBoard.filterStatus')}</Text>
          <View style={styles.filterRow}>
            <FilterChip
              label={t('jobBoard.filterStatusLooking')}
              active={statusFilter === 'looking'}
              onPress={() => setStatusFilter('looking')}
            />
            <FilterChip
              label={t('jobBoard.filterStatusAll')}
              active={statusFilter === 'all'}
              onPress={() => setStatusFilter('all')}
            />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load('initial')} style={styles.retry}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : filteredDrivers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>{t('jobBoard.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('jobBoard.emptySub')}</Text>
          </View>
        ) : (
          filteredDrivers.map((d) => (
            <DriverCard
              key={d.id}
              driver={d}
              busy={addingId === d.id}
              onViewProfile={() => void openProfile(d)}
              onAdd={() => void handleAdd(d)}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={!!profileDriver}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileDriver(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + SPACING.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('jobBoard.profileModalTitle')}</Text>
              <Pressable onPress={() => setProfileDriver(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalProfileTop}>
                {profileAvatar ? (
                  <Image source={{ uri: profileAvatar }} style={styles.modalAvatar} />
                ) : (
                  <View style={styles.avatarPh}>
                    <Text style={styles.avatarPhText}>{(profileName[0] ?? '?').toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalName}>{profileName}</Text>
                  <View style={styles.ratingRow}>
                    <StarRow value={profileDriver?.ratingAverage ?? 0} size={16} />
                    <Text style={styles.ratingMeta}>
                      {profileDriver && profileDriver.ratingCount > 0
                        ? `${profileDriver.ratingAverage.toFixed(1)} (${profileDriver.ratingCount})`
                        : t('jobBoard.noRatings')}
                    </Text>
                  </View>
                </View>
              </View>

              {profileDriver && profileDriver.languageCodes.length > 0 ? (
                <View style={styles.langRow}>
                  {profileDriver.languageCodes.map((code) => (
                    <View key={code} style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>{languageBadgeLabel(code)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {profileDriver?.bio ? (
                <Text style={styles.modalBio}>{profileDriver.bio}</Text>
              ) : (
                <Text style={styles.bioMuted}>{t('jobBoard.noBio')}</Text>
              )}
            </ScrollView>

            {profileDriver ? (
              <Pressable
                onPress={() => {
                  const d = profileDriver;
                  setProfileDriver(null);
                  void handleAdd(d);
                }}
                style={({ pressed }) => [styles.btnGold, SHADOWS.button, pressed && styles.btnPressed]}
              >
                <Ionicons name="person-add-outline" size={18} color={COLORS.black} />
                <Text style={styles.btnGoldText}>{t('jobBoard.addToFleet')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  forbidden: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center' },
  title: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.xs },
  sub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.md },
  filtersCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOWS.card,
  },
  filterSectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  filterChipPressed: { opacity: 0.88 },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextActive: { color: '#0f0f0f' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardTop: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.surfaceAlt },
  avatarPh: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.goldTint,
    borderWidth: 2,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhText: { color: COLORS.goldDark, fontWeight: '800', fontSize: 22 },
  cardMain: { flex: 1 },
  cardName: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  ratingMeta: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.goldTint,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: { color: COLORS.goldDark, fontSize: 11, fontWeight: '700' },
  statusPillMuted: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillMutedText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  langBadge: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  langBadgeText: { color: COLORS.goldDark, fontSize: 12, fontWeight: '700' },
  bio: { color: COLORS.text, fontSize: 14, lineHeight: 21, marginBottom: SPACING.md },
  bioMuted: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  cardActions: { flexDirection: 'row', gap: SPACING.sm },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  btnOutlineText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  btnGold: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 12,
  },
  btnGoldText: { color: COLORS.black, fontSize: 14, fontWeight: '800' },
  btnPressed: { opacity: 0.9 },
  btnDisabled: { opacity: 0.55 },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  errorText: { color: COLORS.error, fontSize: 14, marginBottom: SPACING.sm },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { color: COLORS.gold, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.cardStrong,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  modalProfileTop: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.surfaceAlt },
  modalName: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalBio: { color: COLORS.text, fontSize: 15, lineHeight: 22, marginBottom: SPACING.lg },
});
