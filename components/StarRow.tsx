import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

type Props = {
  value: number;
  max?: number;
  size?: number;
};

export function StarRow({ value, max = 5, size = 18 }: Props) {
  const full = Math.floor(value);
  const half = value - full >= 0.5 ? 1 : 0;
  const empty = max - full - half;

  return (
    <View style={styles.row}>
      {Array.from({ length: full }).map((_, i) => (
        <Text key={`f-${i}`} style={[styles.star, { fontSize: size, marginRight: 2 }]}>
          ★
        </Text>
      ))}
      {half === 1 ? (
        <Text style={[styles.star, styles.half, { fontSize: size, marginRight: 2 }]}>★</Text>
      ) : null}
      {Array.from({ length: empty }).map((_, i) => (
        <Text key={`e-${i}`} style={[styles.starEmpty, { fontSize: size, marginRight: 2 }]}>
          ★
        </Text>
      ))}
      <Text style={styles.value}>{value.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    color: COLORS.gold,
  },
  half: {
    opacity: 0.55,
  },
  starEmpty: {
    color: COLORS.border,
  },
  value: {
    marginLeft: SPACING.sm,
    color: COLORS.grayLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
