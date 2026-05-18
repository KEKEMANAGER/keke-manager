import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { VerifiedBadge } from './VerifiedBadge';

type Props = {
  name: string;
  verified?: boolean | null;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  numberOfLines?: number;
};

export function NameWithVerifiedBadge({ name, verified, textStyle, style, numberOfLines }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={textStyle} numberOfLines={numberOfLines}>
        {name}
      </Text>
      <VerifiedBadge verified={verified} />
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
});
