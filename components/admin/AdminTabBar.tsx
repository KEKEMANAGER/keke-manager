import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';

export type AdminTabId = 'users' | 'verify' | 'chats' | 'bookings' | 'gps' | 'stats' | 'ads';

type TabDef = { id: AdminTabId; label: string; badge?: string | number };

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
        const showBadge = tab.badge !== undefined && tab.badge !== null && tab.badge !== '';
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
            {showBadge ? (
              <View style={[styles.badge, on && styles.badgeOnActive]}>
                <Text style={[styles.badgeText, on && styles.badgeTextOnActive]}>{tab.badge}</Text>
              </View>
            ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOnActive: {
    backgroundColor: '#0f0f0f',
  },
  badgeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextOnActive: {
    color: COLORS.gold,
  },
});
