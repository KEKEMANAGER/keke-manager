import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VehicleRow } from '../../lib/vehicles';
import {
  vehicleClassLabel,
  vehicleTypeLabel,
  normalizeVehicleClass,
  normalizeVehicleType,
} from '../../lib/vehicleCatalog';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';

type Props = {
  vehicles: VehicleRow[];
  /** Shown only when the driver has no vehicle rows at all — the legacy pair
   *  still carried on `profiles`, so an old account does not look empty. */
  legacyType?: string | null;
  legacyClass?: string | null;
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sedan: 'car-outline',
  suv: 'car-sport-outline',
  offroad: 'trail-sign-outline',
  minivan: 'bus-outline',
  microbus: 'bus-outline',
  bus: 'bus-outline',
  special: 'construct-outline',
};

/**
 * The driver's fleet, on his profile, as a list.
 *
 * A driver used to pick ONE vehicle type and ONE class on this screen, which
 * said something untrue the moment he owned a second car — and a host with
 * five of them could only ever describe one. The rest of the platform never
 * believed it anyway: dispatch matches on the `vehicles` table and the job
 * board checks every active vehicle a driver has. Only this screen pretended
 * there was a single answer.
 *
 * So there is no single answer here any more. One car is a list of one, five
 * cars are a list of five, and the only place any of it is edited is the
 * vehicle screen. Two places to write the same fact is what let them drift
 * apart; now there is one.
 */
export function DriverVehiclesSummary({ vehicles, legacyType, legacyClass }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const real = vehicles.filter((v) => v.plate?.trim() || v.model?.trim());
  const open = () => router.push('/(driver)/vehicle');

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {t('profilePage.myVehicles')}
          {real.length > 0 ? ` (${real.length})` : ''}
        </Text>
        <Pressable onPress={open} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
          <Text style={styles.manageText}>{t('profilePage.manageVehicles')}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.goldDark} />
        </Pressable>
      </View>

      {real.length === 0 ? (
        <Pressable onPress={open} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.goldDark} />
          <View style={styles.emptyBody}>
            <Text style={styles.emptyTitle}>{t('profilePage.noVehicleTitle')}</Text>
            <Text style={styles.emptyText}>
              {legacyType
                ? t('profilePage.noVehicleLegacy', {
                    type: vehicleTypeLabel(normalizeVehicleType(legacyType) ?? 'sedan'),
                    class: legacyClass
                      ? vehicleClassLabel(normalizeVehicleClass(legacyClass) ?? 'economy')
                      : '—',
                  })
                : t('profilePage.noVehicleText')}
            </Text>
          </View>
        </Pressable>
      ) : (
        real.map((v) => {
          const type = normalizeVehicleType(v.type ?? '');
          const cls = normalizeVehicleClass(v.class ?? '');
          const bits = [
            v.plate?.trim(),
            v.passenger_capacity ? t('profilePage.seatsShort', { n: v.passenger_capacity }) : null,
          ].filter(Boolean);
          return (
            <Pressable
              key={v.id}
              onPress={open}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Ionicons
                name={ICONS[type ?? 'sedan'] ?? 'car-outline'}
                size={20}
                color={COLORS.textSecondary}
              />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {v.model?.trim() || (type ? vehicleTypeLabel(type) : '—')}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[type ? vehicleTypeLabel(type) : null, cls ? vehicleClassLabel(cls) : null, ...bits]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={[styles.dot, v.is_active ? styles.dotOn : styles.dotOff]} />
            </Pressable>
          );
        })
      )}

      <Text style={styles.hint}>{t('profilePage.vehiclesHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  manage: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  manageText: { fontSize: 13, fontWeight: '700', color: COLORS.goldDark },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowMeta: { marginTop: 1, fontSize: 12, color: COLORS.textSecondary },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotOn: { backgroundColor: COLORS.success },
  dotOff: { backgroundColor: COLORS.border },
  empty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.goldTint,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.button,
    padding: SPACING.sm,
  },
  emptyBody: { flex: 1, minWidth: 0 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  emptyText: { marginTop: 2, fontSize: 12, lineHeight: 17, color: COLORS.textSecondary },
  hint: { marginTop: 2, fontSize: 11, lineHeight: 15, color: COLORS.textMuted },
});
