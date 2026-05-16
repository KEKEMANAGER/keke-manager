import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
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
import { AppLogo } from '../../components/AppLogo';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import { showValidationAlert, validateEmail } from '../../lib/validation';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSendResetLink() {
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      showValidationAlert(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const redirectTo = Linking.createURL('reset-password');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (resetError) {
        setError(getSupabaseErrorMessage(resetError));
        return;
      }

      setSent(true);
    } catch (err: unknown) {
      setError(getSupabaseErrorMessage(err));
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
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppLogo size="auth" />
        <Text style={styles.tagline}>KEKE MANAGER</Text>

        <View style={styles.card}>
          <Text style={styles.title}>{t('authScreen.forgotTitle')}</Text>
          <Text style={styles.subtitle}>{t('authScreen.forgotSubtitle')}</Text>

          {sent ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
              <Text style={styles.successText}>{t('authScreen.linkSentMessage')}</Text>
            </View>
          ) : (
            <>
              <AuthInput
                label={t('auth.email')}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={() => void handleSendResetLink()}
                disabled={loading || !email.trim()}
                style={({ pressed }) => [
                  styles.button,
                  SHADOWS.button,
                  (loading || !email.trim()) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.black} size="small" />
                ) : (
                  <Text style={styles.buttonText}>{t('authScreen.sendLink')}</Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.backRow, pressed && styles.backPressed]}
          >
            <Text style={styles.backLink}>{t('common.back')}</Text>
          </Pressable>

          {!sent ? (
            <View style={styles.footerRow}>
              <Text style={styles.footerMuted}>{t('authScreen.haveAccount')} </Text>
              <Link href="/sign-in" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.link}>{t('authScreen.signIn')}</Text>
                </Pressable>
              </Link>
            </View>
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
  tagline: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.success,
    fontWeight: '600',
    textAlign: 'center',
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
  backRow: {
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  backPressed: {
    opacity: 0.85,
  },
  backLink: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
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
});
