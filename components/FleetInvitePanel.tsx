import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { respondToFleetInvite, type FleetInviteView } from '../lib/fleet';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
} from '../lib/vehicleCatalog';

type Props = {
  invites: FleetInviteView[];
  subDriverId: string;
  onUpdated?: () => void;
  /** Gold top banner (dashboard). */
  variant?: 'default' | 'banner';
};

function vehicleLine(invite: FleetInviteView, t: (k: string) => string): string {
  const v = invite.vehicle;
  if (!v) return t('fleet.inviteVehicleUnknown');
  return [
    v.model?.trim() || (v.type ? vehicleTypeLabel(v.type) : null),
    v.plate?.trim(),
    v.class ? vehicleClassLabel(v.class) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function FleetInvitePanel({
  invites,
  subDriverId,
  onUpdated,
  variant = 'default',
}: Props) {
  const { t } = useTranslation();
  const [actingId, setActingId] = useState<string | null>(null);

  const respond = useCallback(
    async (fleetId: string, accept: boolean) => {
      setActingId(fleetId);
      const { error } = await respondToFleetInvite(subDriverId, fleetId, accept);
      setActingId(null);
      if (error) {
        if (Platform.OS === 'web') {
          window.alert(error.message);
        } else {
          Alert.alert(t('system.errorTitle'), error.message);
        }
        return;
      }
      onUpdated?.();
    },
    [subDriverId, onUpdated, t],
  );

  if (invites.length === 0) return null;

  const isBanner = variant === 'banner';

  return (
    <View style={[styles.wrap, isBanner && styles.wrapBanner]}>
      {!isBanner ? (
        <Text style={styles.sectionTitle}>{t('fleet.invitesTitle')}</Text>
      ) : null}
      {invites.map((invite) => {
        const hostName = invite.host_full_name?.trim() || t('common.driver');
        const busy = actingId === invite.id;
        return (
          <View
            key={invite.id}
            style={[styles.card, SHADOWS.card, isBanner && styles.cardBanner]}
          >
            <View style={styles.cardTop}>
              <Ionicons name="mail-outline" size={22} color={COLORS.gold} />
              <View style={styles.cardMain}>
                <Text style={[styles.title, isBanner && styles.titleBanner]}>
                  {t('fleet.inviteBannerTitle', { host: hostName })}
                </Text>
                <Text style={styles.sub}>{vehicleLine(invite, t)}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => void respond(invite.id, false)}
                disabled={busy}
                style={({ pressed }) => [styles.btnOutline, (pressed || busy) && styles.pressed]}
              >
                <Text style={styles.btnOutlineText}>{t('fleet.inviteDecline')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void respond(invite.id, true)}
                disabled={busy}
                style={({ pressed }) => [styles.btnGold, (pressed || busy) && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color={COLORS.black} size="small" />
                ) : (
                  <Text style={styles.btnGoldText}>{t('fleet.inviteAccept')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm, marginBottom: SPACING.md },
  wrapBanner: { marginBottom: SPACING.lg },
  cardBanner: {
    borderColor: COLORS.gold,
    borderWidth: 2,
    backgroundColor: COLORS.goldTint,
  },
  titleBanner: { fontSize: 17 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gold + '44',
  },
  cardTop: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  cardMain: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  btnOutlineText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  btnGold: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  btnGoldText: { fontSize: 14, fontWeight: '700', color: COLORS.black },
  pressed: { opacity: 0.85 },
});
