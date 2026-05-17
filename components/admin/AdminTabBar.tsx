import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';

export type AdminTabId = 'users' | 'verify' | 'chats' | 'bookings' | 'gps' | 'stats';

type TabDef = { id: AdminTabId; label: string };

type Props = {
  tabs: TabDef[];
  active: AdminTabId;
  onChange: (id: AdminTabId) => void;
};

export function AdminTabBar({ tabs, active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.wrap}
    >
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.chip,
              on && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, on && styles.chipTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 0,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  chipPressed: { opacity: 0.88 },
  chipText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#0f0f0f',
  },
});
