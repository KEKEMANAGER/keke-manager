import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DriverProfileCard } from '../../../components/DriverProfileCard';
import { NameWithVerifiedBadge } from '../../../components/NameWithVerifiedBadge';
import { COLORS, RADIUS, SPACING } from '../../../constants/theme';
import { fetchDriverProfile, type DriverProfile } from '../../../lib/drivers';
import { formatSpokenLanguagesList } from '../../../lib/spokenLanguages';
import { vehicleClassLabel, vehicleTypeLabel } from '../../../lib/vehicleCatalog';

export default function CompanyDriverProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const driverId = (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '').trim();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!driverId) {
      setError(t('company.driverInfoNotFound'));
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchDriverProfile(driverId);
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? t('company.driverInfoNotFound'));
      setProfile(null);
      return;
    }
    setProfile(data);
  }, [driverId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.nav,
          { paddingTop: insets.top + SPACING.sm, paddingBottom: SPACING.sm },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.navTitle}>{t('jobBoard.profileModalTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: SPACING.md,
            paddingBottom: insets.bottom + SPACING.xl,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : profile ? (
          <View style={styles.card}>
            <DriverProfileCard
              fullName={profile.full_name}
              avatarUrl={profile.avatar_url}
              vehiclePhotoUrl={profile.vehicle?.photo_front ?? null}
              vehicleInfo={
                profile.vehicle ? (
                  <>
                    <Text style={styles.vehicleTitle}>
                      {[profile.vehicle.model, profile.vehicle.year, profile.vehicle.color, profile.vehicle.plate]
                        .filter((x) => x !== null && x !== undefined && x !== '')
                        .join(' • ')}
                    </Text>
                    <View style={styles.chipRow}>
                      {profile.vehicle.type ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>{vehicleTypeLabel(profile.vehicle.type)}</Text>
                        </View>
                      ) : null}
                      {profile.vehicle.class ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>{vehicleClassLabel(profile.vehicle.class)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : null
              }
              driverDetails={
                <>
                  <NameWithVerifiedBadge
                    name={profile.full_name || t('company.driverDefault')}
                    verified={profile.is_verified}
                    isGuide={profile.is_guide_driver}
                    textStyle={styles.driverName}
                  />
                  <Text style={styles.ratingText}>
                    ⭐{' '}
                    {profile.rating.count > 0
                      ? t('company.ratingFormat', {
                          avg: profile.rating.average.toFixed(1),
                          count: profile.rating.count,
                        })
                      : t('company.noRatings')}
                  </Text>
                </>
              }
              footer={
                <>
                  {profile.experience_years != null && profile.experience_years > 0 ? (
                    <Text style={styles.infoText}>
                      🕐 {t('company.experienceYears', { years: profile.experience_years })}
                    </Text>
                  ) : null}
                  {profile.languages && profile.languages.length > 0 ? (
                    <Text style={styles.infoText}>
                      {formatSpokenLanguagesList(profile.languages)}
                    </Text>
                  ) : null}
                  {profile.bio ? <Text style={styles.bioText}>{profile.bio}</Text> : null}
                </>
              }
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  scroll: { paddingHorizontal: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  driverName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  ratingText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  vehicleTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    backgroundColor: COLORS.goldTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.goldDark },
  infoText: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.sm },
  bioText: { fontSize: 14, color: COLORS.text, lineHeight: 21, marginTop: SPACING.sm },
  errorBox: {
    marginTop: SPACING.xl,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: { color: COLORS.error, marginBottom: SPACING.sm },
  retry: { alignSelf: 'flex-start' },
  retryText: { color: COLORS.gold, fontWeight: '700' },
});
