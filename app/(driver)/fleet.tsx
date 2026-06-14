import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import {
  fetchFleetForHost,
  removeFleetMember,
  type FleetMemberView,
} from '../../lib/fleet';
import { supabase } from '../../lib/supabase';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
} from '../../lib/vehicleCatalog';
import { useAuth } from '../../contexts/AuthContext';
import { FleetMemberDetailModal } from '../../components/FleetMemberDetailModal';

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return '< 5s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function gpsStatus(loc: FleetMemberView['location'], t: (k: string) => string) {
  if (!loc) return { label: t('fleet.gpsOff'), color: COLORS.textMuted, live: false };
  const stale = Date.now() - new Date(loc.updated_at).getTime() > 90_000;
  if (stale) return { label: t('fleet.gpsStale'), color: COLORS.gold, live: false };
  return { label: t('fleet.gpsLive'), color: COLORS.success, live: true };
}

function FleetMemberCard({
  member,
  onPress,
  onChat,
  onRemove,
  busy,
}: {
  member: FleetMemberView;
  onPress: () => void;
  onChat: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const name = member.sub_full_name?.trim() || member.sub_email || t('common.driver');
  const vehicle = member.vehicle;
  const vehicleLine = vehicle
    ? [
        vehicle.model?.trim() || (vehicle.type ? vehicleTypeLabel(vehicle.type) : null),
        vehicle.plate?.trim(),
        vehicle.class ? vehicleClassLabel(vehicle.class) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '—';
  const gps = gpsStatus(member.location, t);
  const isPending = member.status === 'pending';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(name[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardMain}>
          <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
          {member.sub_email ? (
            <Text style={styles.cardEmail} numberOfLines={1}>{member.sub_email}</Text>
          ) : null}
          <Text style={styles.cardVehicle} numberOfLines={2}>{vehicleLine}</Text>
          {isPending ? (
            <Text style={styles.pendingBadge}>{t('fleet.statusPending')}</Text>
          ) : null}
        </View>
        {!isPending ? (
          <View style={[styles.gpsPill, { borderColor: gps.color }]}>
            <View style={[styles.gpsDot, { backgroundColor: gps.color }]} />
            <Text style={[styles.gpsPillText, { color: gps.color }]}>{gps.label}</Text>
          </View>
        ) : null}
      </View>

      {member.location ? (
        <Text style={styles.coordMeta}>
          {t('fleet.lastSeen', { ago: formatAgo(member.location.updated_at) })}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onChat();
          }}
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnGold, pressed && styles.pressed]}
        >
          <Ionicons name="chatbubble-outline" size={16} color={COLORS.goldDark} />
          <Text style={styles.actionBtnGoldText}>{t('fleet.chat')}</Text>
        </Pressable>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onRemove();
          }}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Ionicons name="person-remove-outline" size={16} color={COLORS.error} />
          <Text style={styles.actionBtnDangerText}>{t('fleet.remove')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function DriverFleetScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.id;

  const [members, setMembers] = useState<FleetMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [detailMember, setDetailMember] = useState<FleetMemberView | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
      if (!userId) {
        setMembers([]);
        setLoading(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);

      const { data, error: err } = await fetchFleetForHost(userId, { includePending: true });
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      if (err) {
        setError(err.message);
        setMembers([]);
        return;
      }
      setMembers(data);
    },
    [userId],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const locChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId || members.length === 0) return;
    const subIds = members.map((m) => m.sub_driver_id).filter(Boolean);
    if (subIds.length === 0) return;

    const filter =
      subIds.length === 1
        ? `driver_id=eq.${subIds[0]}`
        : `driver_id=in.(${subIds.map((id) => `"${id}"`).join(',')})`;

    const ch = supabase
      .channel(`fleet-host-locs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter,
        },
        () => void load('silent'),
      )
      .subscribe();
    locChannelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, members, load]);

  function callPhone(phone: string | null) {
    const trimmed = phone?.trim();
    if (!trimmed) return;
    void Linking.openURL(`tel:${trimmed.replace(/\s/g, '')}`);
  }

  async function handleRemove(member: FleetMemberView) {
    if (!userId) return;
    setRemovingId(member.id);
    const { error: err } = await removeFleetMember(member.id, userId);
    setRemovingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    if (detailMember?.id === member.id) {
      setDetailMember(null);
    }
    void load('silent');
  }

  function openChat(member: FleetMemberView) {
    router.push({
      pathname: '/(driver)/chat',
      params: {
        uid: member.sub_driver_id,
        name: member.sub_full_name?.trim() || member.sub_email || '',
      },
    });
  }

  return (
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
      <Text style={styles.title}>{t('fleet.title')}</Text>
      <Text style={styles.sub}>{t('fleet.subtitle')}</Text>

      {loading ? (
        <ActivityIndicator color={COLORS.gold} style={{ marginTop: SPACING.xl }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load('initial')} style={styles.retry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>{t('fleet.emptyTitle')}</Text>
          <Text style={styles.emptySub}>{t('fleet.emptySub')}</Text>
          <Pressable
            onPress={() => router.push('/(driver)/find-drivers')}
            style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
          >
            <Text style={styles.emptyBtnText}>{t('tabs.findDrivers')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(driver)/vehicle')}
            style={({ pressed }) => [styles.emptyBtnSecondary, pressed && styles.pressed]}
          >
            <Text style={styles.emptyBtnSecondaryText}>{t('fleet.goToVehicles')}</Text>
          </Pressable>
        </View>
      ) : (
        members.map((m) => (
          <FleetMemberCard
            key={m.id}
            member={m}
            busy={removingId === m.id}
            onPress={() => setDetailMember(m)}
            onChat={() => openChat(m)}
            onRemove={() => void handleRemove(m)}
          />
        ))
      )}

      <FleetMemberDetailModal
        member={detailMember}
        hostDriverId={userId}
        visible={!!detailMember}
        onClose={() => setDetailMember(null)}
        onChat={(member) => {
          setDetailMember(null);
          openChat(member);
        }}
        onCall={callPhone}
        onRemove={(member) => void handleRemove(member)}
        removing={!!detailMember && removingId === detailMember.id}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg },
  title: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginBottom: SPACING.xs },
  sub: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.goldDark, fontWeight: '800', fontSize: 15 },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardEmail: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  pendingBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.goldDark,
    backgroundColor: COLORS.goldTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardVehicle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
  },
  gpsDot: { width: 6, height: 6, borderRadius: 3 },
  gpsPillText: { fontSize: 10, fontWeight: '700' },
  coordMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: SPACING.sm,
    marginLeft: 48,
  },
  cardActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flex: 1,
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
  actionBtnGold: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  actionBtnGoldText: { color: COLORS.goldDark, fontSize: 13, fontWeight: '700' },
  actionBtnDangerText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: SPACING.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
  },
  emptyBtnText: { color: '#0f0f0f', fontWeight: '800', fontSize: 14 },
  emptyBtnSecondary: {
    marginTop: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  emptyBtnSecondaryText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  errorBox: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: { color: COLORS.error, marginBottom: SPACING.sm },
  retry: { alignSelf: 'flex-start' },
  retryText: { color: COLORS.gold, fontWeight: '700' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
