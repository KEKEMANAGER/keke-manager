import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type PushHealthAction = {
  label: string;
  icon?: IconName;
  onPress: () => void;
};

type Props = {
  icon: IconName;
  title: string;
  body: string;
  actions: PushHealthAction[];
  /** Shown as a small × in the corner when set. */
  onClose?: () => void;
  closeLabel?: string;
  testID?: string;
};

/** The look of the "you are not getting booking alerts" card on the driver dashboard. */
export function PushHealthCard({ icon, title, body, actions, onClose, closeLabel, testID }: Props) {
  return (
    <View style={styles.card} testID={testID} accessibilityRole="alert">
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={COLORS.goldDark} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={18} color={COLORS.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          >
            {a.icon ? <Ionicons name={a.icon} size={16} color={COLORS.black} /> : null}
            <Text style={styles.actionText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.goldTint,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  body: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
  closeBtn: { padding: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.button,
  },
  actionText: { fontSize: 13, fontWeight: '800', color: COLORS.black },
  pressed: { opacity: 0.85 },
});
