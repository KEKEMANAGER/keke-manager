import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import type { FleetMemberView } from '../lib/fleet';

function gpsStatus(loc: FleetMemberView['location'], t: (k: string) => string) {
  if (!loc) return { label: t('fleet.gpsOff'), color: COLORS.textMuted };
  const stale = Date.now() - new Date(loc.updated_at).getTime() > 90_000;
  if (stale) return { label: t('fleet.gpsStale'), color: COLORS.gold };
  return { label: t('fleet.gpsLive'), color: COLORS.success };
}

type Props = {
  members: FleetMemberView[];
  onOpenFleet?: () => void;
};

export function HostMyDriverPanel({ members, onOpenFleet }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const accepted = members.filter((m) => m.status === 'accepted');
  if (accepted.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {accepted.map((member) => {
        const name = member.sub_full_name?.trim() || member.sub_email || t('common.driver');
        const gps = gpsStatus(member.location, t);
        return (
          <View key={member.id} style={[styles.card, SHADOWS.card]}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={styles.main}>
                <Text style={styles.title}>{t('fleet.myDriver', { name })}</Text>
                <View style={styles.gpsRow}>
                  <View style={[styles.gpsDot, { backgroundColor: gps.color }]} />
                  <Text style={[styles.gpsText, { color: gps.color }]}>{gps.label}</Text>
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(driver)/fleet-map',
                    params: {
                      driverId: member.sub_driver_id,
                      driverName: name,
                    },
                  })
                }
                style={({ pressed }) => [styles.btnGold, pressed && styles.pressed]}
              >
                <Ionicons name="navigate-outline" size={16} color={COLORS.black} />
                <Text style={styles.btnGoldText}>{t('fleet.viewDriverGps')}</Text>
              </Pressable>
              {onOpenFleet ? (
                <Pressable
                  onPress={onOpenFleet}
                  style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
                >
                  <Text style={styles.btnOutlineText}>{t('tabs.fleet')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm, marginBottom: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gold + '55',
  },
  row: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: COLORS.goldDark },
  main: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btnGold: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
  },
  btnGoldText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  btnOutline: {
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnOutlineText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  pressed: { opacity: 0.88 },
});
