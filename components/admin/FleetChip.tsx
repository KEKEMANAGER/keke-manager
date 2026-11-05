import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import type { FleetClass, FleetProblemTone } from '../../lib/adminFleetLogic';

export type FleetTone = FleetProblemTone | 'success' | 'neutral';

/** Text and fill pairs that keep 4.5:1 contrast. */
export const FLEET_TONE_COLORS: Record<FleetTone, { bg: string; fg: string; border: string }> = {
  danger: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  warn: { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  info: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  muted: { bg: '#F0F1F3', fg: '#4B5563', border: COLORS.border },
  success: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  neutral: { bg: COLORS.white, fg: COLORS.text, border: COLORS.border },
};

export const FLEET_CLASS_TONE: Record<FleetClass, FleetTone> = {
  economy: 'success',
  comfort: 'info',
  vip: 'warn',
};

/** A small rounded label. */
export function FleetBadge({ label, tone }: { label: string; tone: FleetTone }) {
  const c = FLEET_TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A filter chip: gold when on. */
export function FleetFilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Text style={styles.chipText}>{label}</Text>
      {typeof count === 'number' ? <Text style={styles.chipCount}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  chipCount: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
