import { type TextInputProps, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

type Props = TextInputProps & {
  label: string;
};

export function AuthInput({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={COLORS.gray}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.grayLight,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.white,
  },
});
