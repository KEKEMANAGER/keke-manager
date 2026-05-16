import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  message: string;
};

/** Centered empty list — gray icon + muted copy (spec). */
export function ListEmptyState({ icon, message }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={40} color={COLORS.textMuted} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 1.5,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  message: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});
