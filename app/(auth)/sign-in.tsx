import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AuthBrandHeader } from '../../components/AuthBrandHeader';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { pressableSx, sx } from '../../lib/sx';
import {
  showErrorAlert,
  showValidationAlert,
  validateSignInFields,
  type SignInFieldErrors,
} from '../../lib/validation';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignInFieldErrors>({});

  async function handleSignIn() {
    const fields = validateSignInFields({
      email: emailAddress,
      password,
    });
    setFieldErrors(fields);
    if (fields.email || fields.password) {
      const first = fields.email ?? fields.password ?? '';
      setError(first);
      showValidationAlert(first);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await signIn(emailAddress.trim(), password);
      if (signInError) {
        const message = getSupabaseErrorMessage(signInError);
        setError(message);
        showErrorAlert(message);
        return;
      }
      router.replace('/');
    } catch (err: unknown) {
      const message = getSupabaseErrorMessage(err);
      setError(message);
      showErrorAlert(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={sx(styles.scroll, {
          paddingTop: insets.top + SPACING.xl,
          paddingBottom: insets.bottom + SPACING.xl,
        })}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBrandHeader />

        <View style={styles.card}>
          <Text style={styles.title}>{t('common.signIn')}</Text>

          <AuthInput
            label={t('auth.email')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={emailAddress}
            onChangeText={setEmailAddress}
            error={fieldErrors.email}
          />
          <AuthInput
            label={t('auth.password')}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
          />

          <Link href="/forgot-password" asChild>
            <Pressable style={styles.forgotRow} hitSlop={8}>
              <Text style={styles.forgotLink}>{t('auth.forgotPassword')}</Text>
            </Pressable>
          </Link>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSignIn}
            disabled={loading || !emailAddress.trim() || !password}
            style={pressableSx(
              styles.button,
              SHADOWS.button,
              (loading || !emailAddress.trim() || !password) ? styles.buttonDisabled : undefined,
              (pressed) => (pressed ? styles.buttonPressed : undefined),
            )}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>{t('common.signIn')}</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerMuted}>{t('auth.noAccount')} </Text>
            <Link href="/sign-up" asChild>
              <Pressable hitSlop={8}>
                <Text style={styles.link}>{t('common.signUp')}</Text>
              </Pressable>
            </Link>
          </View>

          {__DEV__ ? (
            <Link href="/dev-qr" asChild>
              <Pressable style={styles.devQrLink} hitSlop={8}>
                <Text style={styles.devQrLinkText}>{t('devQr.openScreen')}</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  forgotLink: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  button: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: RADIUS.button,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.9,
    backgroundColor: COLORS.goldDark,
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 17,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: SPACING.lg,
  },
  footerMuted: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
  link: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
  },
  devQrLink: {
    marginTop: SPACING.md,
    alignSelf: 'center',
  },
  devQrLinkText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
