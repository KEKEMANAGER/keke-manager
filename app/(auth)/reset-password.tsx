import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  createSessionFromAuthUrl,
  isPasswordRecoveryUrl,
} from '../../lib/passwordResetAuth';
import { supabase } from '../../lib/supabase';
import {
  showErrorAlert,
  showValidationAlert,
  validatePasswordConfirm,
} from '../../lib/validation';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [linkReady, setLinkReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolvingLink, setResolvingLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const processRecoveryUrl = useCallback(async (url: string) => {
    if (!isPasswordRecoveryUrl(url)) return;
    setResolvingLink(true);
    setLinkError(null);
    const result = await createSessionFromAuthUrl(url);
    setResolvingLink(false);
    if (!result.ok) {
      const message =
        result.error === 'missing_tokens'
          ? t('authScreen.resetInvalidLink')
          : (result.error ?? t('authScreen.resetInvalidLink'));
      setLinkError(message);
      setLinkReady(false);
      return;
    }
    setLinkReady(true);
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const initial = await Linking.getInitialURL();
      if (initial && isPasswordRecoveryUrl(initial)) {
        await processRecoveryUrl(initial);
        if (!cancelled) return;
      }

      if (!cancelled) {
        setResolvingLink(false);
        if (session) {
          setLinkReady(true);
        }
      }
    }

    void bootstrap();

    const sub = Linking.addEventListener('url', ({ url }) => {
      void processRecoveryUrl(url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [processRecoveryUrl, session]);

  useEffect(() => {
    if (authLoading || resolvingLink) return;
    if (session && !linkReady) {
      setLinkReady(true);
    }
  }, [authLoading, resolvingLink, session, linkReady]);

  async function handleSavePassword() {
    const validationError = validatePasswordConfirm(newPassword, confirmPassword);
    if (validationError) {
      setFieldError(validationError);
      showValidationAlert(validationError);
      return;
    }

    if (!session) {
      const message = t('authScreen.resetSessionRequired');
      setSaveError(message);
      showErrorAlert(message);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFieldError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const message = getSupabaseErrorMessage(error);
        setSaveError(message);
        showErrorAlert(message);
        return;
      }

      await supabase.auth.signOut();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`${t('common.success')}\n\n${t('authScreen.resetSuccess')}`);
      } else {
        Alert.alert(t('common.success'), t('authScreen.resetSuccess'));
      }
      router.replace('/sign-in');
    } catch (err: unknown) {
      const message = getSupabaseErrorMessage(err);
      setSaveError(message);
      showErrorAlert(message);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = linkReady && !resolvingLink && !authLoading;
  const showForm = canSubmit;

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
          <Text style={styles.title}>{t('authScreen.resetPasswordTitle')}</Text>
          <Text style={styles.subtitle}>{t('authScreen.resetPasswordSubtitle')}</Text>

          {resolvingLink || authLoading ? (
            <ActivityIndicator color={COLORS.gold} style={styles.loader} />
          ) : null}

          {!resolvingLink && !authLoading && linkError ? (
            <Text style={styles.error}>{linkError}</Text>
          ) : null}

          {!resolvingLink && !authLoading && !linkError && !showForm ? (
            <Text style={styles.hint}>{t('authScreen.resetOpenFromEmail')}</Text>
          ) : null}

          {showForm ? (
            <>
              <AuthInput
                label={t('authScreen.newPassword')}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                value={newPassword}
                onChangeText={setNewPassword}
                error={fieldError ?? undefined}
              />
              <AuthInput
                label={t('authScreen.confirmPassword')}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />

              {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

              <Pressable
                onPress={() => void handleSavePassword()}
                disabled={saving || !newPassword || !confirmPassword}
                style={({ pressed }) => [
                  styles.button,
                  SHADOWS.button,
                  (saving || !newPassword || !confirmPassword) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.black} size="small" />
                ) : (
                  <Text style={styles.buttonText}>{t('authScreen.savePassword')}</Text>
                )}
              </Pressable>
            </>
          ) : null}

          <Pressable
            onPress={() => router.replace('/sign-in')}
            hitSlop={8}
            style={({ pressed }) => [styles.backRow, pressed && styles.backPressed]}
          >
            <Text style={styles.backLink}>{t('authScreen.backToSignIn')}</Text>
          </Pressable>
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
  loader: {
    marginVertical: SPACING.lg,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
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
});
