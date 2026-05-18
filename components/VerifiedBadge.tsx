import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';

type Props = {
  verified?: boolean | null;
};

export function VerifiedBadge({ verified }: Props) {
  if (!verified) return null;
  return (
    <View style={styles.badge} accessibilityLabel="Verified">
      <Text style={styles.check}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
    marginTop: -1,
  },
});
