import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { type TextInputProps, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { pressableSx, sx } from '../lib/sx';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
};

/**
 * Labelled text field for the auth screens and forms.
 *
 * A password field (`secureTextEntry`) gets an eye button that shows what was
 * typed. Hidden behind dots, a password chosen a minute earlier was being
 * retyped wrong at sign-in, one character off, again and again, with nothing
 * on screen to say so. While shown, the keyboard neither corrects nor suggests,
 * so the text stays exactly what was typed.
 */
export function AuthInput({ label, style, error, secureTextEntry, ...rest }: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isPassword = secureTextEntry === true;

  if (!isPassword) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          placeholderTextColor={COLORS.textMuted}
          style={sx(styles.input, error ? styles.inputError : undefined, style)}
          {...rest}
        />
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          placeholderTextColor={COLORS.textMuted}
          style={sx(styles.input, styles.inputWithToggle, error ? styles.inputError : undefined, style)}
          autoCorrect={false}
          spellCheck={false}
          {...rest}
          secureTextEntry={!revealed}
          keyboardType={revealed && Platform.OS === 'android' ? 'visible-password' : rest.keyboardType}
        />
        <Pressable
          onPress={() => setRevealed((v) => !v)}
          style={pressableSx(styles.toggle, (pressed) => pressed && styles.togglePressed)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          <Ionicons
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={COLORS.textSecondary}
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
  },
  label: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithToggle: {
    paddingRight: 48,
  },
  toggle: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePressed: {
    opacity: 0.6,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
});
