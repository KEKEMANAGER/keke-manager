import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { pickLiveFleetMember, type FleetMemberView } from '../lib/fleet';

type Props = {
  visible: boolean;
  fleetMembers: FleetMemberView[];
  onSelectSelf: () => void;
  onSelectMember: (member: FleetMemberView) => void;
  onCancel: () => void;
};

function memberName(member: FleetMemberView, fallback: string) {
  return member.sub_full_name?.trim() || member.sub_email?.trim() || fallback;
}

function memberVehicleLine(member: FleetMemberView) {
  const v = member.vehicle;
  if (!v) return null;
  return [v.model?.trim(), v.plate?.trim()].filter(Boolean).join(' · ') || null;
}

type OptionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  badgeColor?: string;
  variant?: 'gold' | 'live' | 'default';
  onPress: () => void;
};

function AcceptOption({
  icon,
  title,
  subtitle,
  badge,
  badgeColor = COLORS.success,
  variant = 'default',
  onPress,
}: OptionProps) {
  const cardStyle =
    variant === 'gold'
      ? styles.optionGold
      : variant === 'live'
        ? styles.optionLive
        : styles.optionDefault;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, cardStyle, pressed && styles.pressed]}
    >
      <View style={[styles.optionIcon, variant === 'gold' && styles.optionIconGold]}>
        <Ionicons
          name={icon}
          size={22}
          color={variant === 'gold' ? COLORS.black : COLORS.gold}
        />
      </View>
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.optionSub}>{subtitle}</Text> : null}
        {badge ? (
          <View style={styles.badgeRow}>
            <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </Pressable>
  );
}

export function FleetHostAcceptModal({
  visible,
  fleetMembers,
  onSelectSelf,
  onSelectMember,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const liveMember = useMemo(
    () => (visible ? pickLiveFleetMember(fleetMembers) : null),
    [visible, fleetMembers],
  );

  const otherMembers = useMemo(() => {
    if (!liveMember) return fleetMembers;
    return fleetMembers.filter((m) => m.sub_driver_id !== liveMember.sub_driver_id);
  }, [fleetMembers, liveMember]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{t('fleet.pickSubForBooking')}</Text>
          <Text style={styles.sub}>{t('fleet.pickSubForBookingSub')}</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <AcceptOption
              icon="person-outline"
              title={t('fleet.acceptAsSelf')}
              subtitle={t('fleet.acceptAsSelfHint')}
              variant="gold"
              onPress={onSelectSelf}
            />

            {liveMember ? (
              <AcceptOption
                icon="navigate-outline"
                title={t('fleet.acceptActiveDriver', {
                  name: memberName(liveMember, t('common.driver')),
                })}
                subtitle={memberVehicleLine(liveMember)}
                badge={t('fleet.gpsLive')}
                variant="live"
                onPress={() => onSelectMember(liveMember)}
              />
            ) : null}

            {otherMembers.length > 0 ? (
              <Text style={styles.sectionLabel}>{t('fleet.pickSubSectionDrivers')}</Text>
            ) : null}

            {otherMembers.map((member) => {
              const name = memberName(member, t('common.driver'));
              return (
                <AcceptOption
                  key={member.id}
                  icon="car-outline"
                  title={name}
                  subtitle={memberVehicleLine(member)}
                  onPress={() => onSelectMember(member)}
                />
              );
            })}
          </ScrollView>

          <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  sub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  list: {
    maxHeight: 420,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    marginLeft: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.card,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  optionGold: {
    backgroundColor: COLORS.goldTint,
    borderColor: COLORS.gold + '66',
  },
  optionLive: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.success + '55',
  },
  optionDefault: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.goldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconGold: {
    backgroundColor: COLORS.gold,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: SPACING.xs,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pressed: { opacity: 0.88 },
});
