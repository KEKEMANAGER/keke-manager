import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { GuideDriverBadge } from './GuideDriverBadge';
import { VerifiedBadge } from './VerifiedBadge';

type Props = {
  name: string;
  verified?: boolean | null;
  isGuide?: boolean | null;
  /** Voucher layout — guide label without emoji prefix. */
  plainGuideBadge?: boolean;
  guideBadgeLabel?: string;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
};

export function NameWithVerifiedBadge({
  name,
  verified,
  isGuide,
  plainGuideBadge,
  guideBadgeLabel,
  textStyle,
  style,
  numberOfLines,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={[textStyle, styles.name]} numberOfLines={numberOfLines}>
        {name}
      </Text>
      <View style={styles.badges}>
        {isGuide ? <GuideDriverBadge compact hideEmoji={plainGuideBadge} label={guideBadgeLabel} /> : null}
        <VerifiedBadge verified={verified} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  name: {
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
});
