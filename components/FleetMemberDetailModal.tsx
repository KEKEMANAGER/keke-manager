import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StarRow } from './StarRow';
import { NameWithVerifiedBadge } from './NameWithVerifiedBadge';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import type { BookingStatus } from '../lib/bookings';
import { bookingStatusLabel } from '../lib/bookings';
import {
  fetchFleetMemberProfile,
  type FleetMemberProfile,
  type FleetMemberView,
} from '../lib/fleet';
import { languageBadgeLabel } from '../lib/jobBoard';
import { withCacheBust } from '../lib/mediaUpload';
import { vehicleClassLabel, vehicleTypeLabel } from '../lib/vehicleCatalog';

type Props = {
  member: FleetMemberView | null;
  hostDriverId: string | undefined;
  visible: boolean;
  onClose: () => void;
  onChat: (member: FleetMemberView) => void;
  onCall: (phone: string | null) => void;
  onRemove: (member: FleetMemberView) => void;
  removing: boolean;
};

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const clean = value?.trim();
  if (!clean) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{clean}</Text>
    </View>
  );
}

function gpsLabel(
  member: FleetMemberView | null,
  t: (key: string) => string,
): { label: string; color: string } {
  if (!member?.location) return { label: t('fleet.gpsOff'), color: COLORS.textMuted };
  const stale = Date.now() - new Date(member.location.updated_at).getTime() > 90_000;
  if (stale) return { label: t('fleet.gpsStale'), color: COLORS.gold };
  return { label: t('fleet.gpsLive'), color: COLORS.success };
}

export function FleetMemberDetailModal({
  member,
  hostDriverId,
  visible,
  onClose,
  onChat,
  onCall,
  onRemove,
  removing,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<FleetMemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!member || !hostDriverId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchFleetMemberProfile(hostDriverId, member.sub_driver_id);
    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      setProfile(null);
      return;
    }
    setProfile(res.data);
  }, [member, hostDriverId]);

  useEffect(() => {
    if (visible && member) {
      void load();
    } else {
      setProfile(null);
      setError(null);
    }
  }, [visible, member, load]);

  if (!member) return null;

  const name =
    profile?.full_name?.trim() ||
    member.sub_full_name?.trim() ||
    profile?.email?.trim() ||
    member.sub_email ||
    t('common.driver');
  const avatarUri = profile?.avatar_url
    ? withCacheBust(profile.avatar_url) ?? profile.avatar_url
    : null;
  const gps = gpsLabel(member, t);
  const vehiclePhoto = profile?.vehicle_photo_front
    ? withCacheBust(profile.vehicle_photo_front) ?? profile.vehicle_photo_front
    : null;
  const vehicleLine = [
    profile?.vehicle_model?.trim(),
    profile?.vehicle_plate?.trim(),
    profile?.vehicle_type ? vehicleTypeLabel(profile.vehicle_type) : null,
    profile?.vehicle_class ? vehicleClassLabel(profile.vehicle_class) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('fleet.memberDetailTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.gold} style={{ marginVertical: SPACING.xl }} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.profileTop}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPh}>
                    <Text style={styles.avatarPhText}>{(name[0] ?? '?').toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.profileMeta}>
                  <NameWithVerifiedBadge
                    name={name}
                    verified={profile?.is_verified ?? false}
                    textStyle={styles.profileName}
                  />
                  <View style={styles.ratingRow}>
                    <StarRow value={profile?.rating_average ?? 0} size={15} />
                    <Text style={styles.ratingMeta}>
                      {(profile?.rating_count ?? 0) > 0
                        ? `${(profile?.rating_average ?? 0).toFixed(1)} (${profile?.rating_count})`
                        : t('jobBoard.noRatings')}
                    </Text>
                  </View>
                  {member.status === 'pending' ? (
                    <Text style={styles.pendingBadge}>{t('fleet.statusPending')}</Text>
                  ) : (
                    <View style={[styles.gpsPill, { borderColor: gps.color }]}>
                      <View style={[styles.gpsDot, { backgroundColor: gps.color }]} />
                      <Text style={[styles.gpsPillText, { color: gps.color }]}>{gps.label}</Text>
                    </View>
                  )}
                </View>
              </View>

              {profile && profile.languages.length > 0 ? (
                <View style={styles.langRow}>
                  {profile.languages.map((code) => (
                    <View key={code} style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>{languageBadgeLabel(code)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {profile?.bio?.trim() ? (
                <Text style={styles.bio}>{profile.bio.trim()}</Text>
              ) : (
                <Text style={styles.bioMuted}>{t('jobBoard.noBio')}</Text>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('fleet.memberContactSection')}</Text>
                <DetailRow label={t('auth.email')} value={profile?.email ?? member.sub_email} />
                <DetailRow label={t('auth.phone')} value={profile?.phone} />
                {profile?.experience_years != null && profile.experience_years > 0 ? (
                  <DetailRow
                    label={t('fleet.memberExperience')}
                    value={t('company.experienceYears', { years: profile.experience_years })}
                  />
                ) : null}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('fleet.memberVehicleSection')}</Text>
                {vehiclePhoto ? (
                  <Image source={{ uri: vehiclePhoto }} style={styles.vehiclePhoto} resizeMode="cover" />
                ) : null}
                <DetailRow label={t('fleet.memberVehicleLine')} value={vehicleLine || '—'} />
                {profile?.vehicle_color?.trim() ? (
                  <DetailRow label={t('companyVoucher.color')} value={profile.vehicle_color} />
                ) : null}
                {profile?.vehicle_year ? (
                  <DetailRow label={t('fleet.memberVehicleYear')} value={String(profile.vehicle_year)} />
                ) : null}
              </View>

              {profile?.active_booking_id ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('fleet.memberActiveTrip')}</Text>
                  <DetailRow
                    label={t('fleet.memberTripStatus')}
                    value={bookingStatusLabel(
                      (profile.active_booking_status ?? 'pending') as BookingStatus,
                    )}
                  />
                  <DetailRow
                    label={t('fleet.memberTripRoute')}
                    value={profile.active_booking_route}
                  />
                </View>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={() => onChat(member)}
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnGold, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.goldDark} />
              <Text style={styles.actionBtnGoldText}>{t('fleet.chat')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onCall(profile?.phone ?? null)}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Ionicons name="call-outline" size={16} color="#2563EB" />
              <Text style={styles.actionBtnCallText}>{t('emergencyReplacement.call')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onRemove(member)}
              disabled={removing}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, removing && styles.disabled]}
            >
              <Ionicons name="person-remove-outline" size={16} color={COLORS.error} />
              <Text style={styles.actionBtnDangerText}>{t('fleet.remove')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, flex: 1 },
  scroll: { paddingBottom: SPACING.md },
  profileTop: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPh: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  avatarPhText: { fontSize: 24, fontWeight: '800', color: COLORS.goldDark },
  profileMeta: { flex: 1, gap: 4 },
  profileName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingMeta: { fontSize: 13, color: COLORS.textSecondary },
  pendingBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.goldDark,
    backgroundColor: COLORS.goldTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  gpsDot: { width: 6, height: 6, borderRadius: 3 },
  gpsPillText: { fontSize: 10, fontWeight: '700' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.sm },
  langBadge: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  langBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  bio: { fontSize: 14, lineHeight: 20, color: COLORS.text, marginBottom: SPACING.md },
  bioMuted: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  detailValue: {
    flex: 1.2,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
  },
  vehiclePhoto: {
    width: '100%',
    height: 140,
    borderRadius: RADIUS.button,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  actionBtnGold: { borderColor: COLORS.gold, backgroundColor: COLORS.goldTint },
  actionBtnGoldText: { color: COLORS.goldDark, fontSize: 13, fontWeight: '700' },
  actionBtnCallText: { color: '#2563EB', fontSize: 13, fontWeight: '700' },
  actionBtnDangerText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },
  errorBox: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1,
    borderColor: COLORS.error,
    marginVertical: SPACING.md,
  },
  errorText: { color: COLORS.error, marginBottom: SPACING.sm },
  retryText: { color: COLORS.gold, fontWeight: '700' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
