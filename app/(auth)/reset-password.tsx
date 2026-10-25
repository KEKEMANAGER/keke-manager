import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { AuthBrandHeader } from '../../components/AuthBrandHeader';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  createSessionFromAuthUrl,
  isRecoveryErrorOnly,
  onPendingRecoveryUrl,
  startRecoveryLinkCapture,
  takePendingRecoveryUrl,
} from '../../lib/passwordResetAuth';
import { supabase } from '../../lib/supabase';
import {
  showErrorAlert,
  showValidationAlert,
  validatePassword,
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
  const linkReadyRef = useRef(false);
  const linksInFlight = useRef(0);

  const processRecoveryUrl = useCallback(async (url: string) => {
    // Tapping the mail link a second time comes back as "already used"; once
    // the first tap has opened the form, that must not take it away again.
    if (linkReadyRef.current && isRecoveryErrorOnly(url)) return;
    linksInFlight.current += 1;
    setResolvingLink(true);
    setLinkError(null);
    let result: { ok: boolean; error?: string };
    try {
      result = await createSessionFromAuthUrl(url);
    } catch (err: unknown) {
      result = { ok: false, error: getSupabaseErrorMessage(err) };
    } finally {
      linksInFlight.current -= 1;
    }
    if (linksInFlight.current === 0) setResolvingLink(false);
    if (!result.ok) {
      const message =
        result.error === 'missing_tokens' || result.error === 'link_invalid'
          ? t('authScreen.resetInvalidLink')
          : (result.error ?? t('authScreen.resetInvalidLink'));
      setLinkError(message);
      linkReadyRef.current = false;
      setLinkReady(false);
      return;
    }
    linkReadyRef.current = true;
    setLinkReady(true);
  }, [t]);

  // The link is caught at app start (see passwordResetAuth) and taken here:
  // with the app already open when the link is tapped, it arrives before this
  // screen exists. Each link is used once — the session it carries is
  // one-time, and re-reading it on every session change used to set the
  // session again and again, so the form never settled.
  useEffect(() => {
    let active = true;
    const takeWaitingLink = (): boolean => {
      const url = takePendingRecoveryUrl();
      if (!url) return false;
      void processRecoveryUrl(url);
      return true;
    };

    // A link tapped while this screen is already open.
    const unsubscribe = onPendingRecoveryUrl(() => {
      if (active) takeWaitingLink();
    });

    // The link that brought the user here.
    void startRecoveryLinkCapture().then(() => {
      if (!active) return;
      if (!takeWaitingLink() && linksInFlight.current === 0) {
        setResolvingLink(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [processRecoveryUrl]);

  useEffect(() => {
    if (authLoading || resolvingLink) return;
    if (session && !linkReady) {
      linkReadyRef.current = true;
      setLinkReady(true);
    }
  }, [authLoading, resolvingLink, session, linkReady]);

  async function handleSavePassword() {
    const validationError =
      validatePassword(newPassword) ?? validatePasswordConfirm(newPassword, confirmPassword);
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

      // The mail link already signed the user in, and the new password is now
      // set: stay signed in and go straight into the app. Sending him back to
      // sign in made him retype, behind dots, a password chosen a moment ago,
      // and one wrong character was "email or password is incorrect" over and
      // over. The start screen sends a driver and a company each to their own.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`${t('common.success')}\n\n${t('authScreen.resetSuccess')}`);
      } else {
        Alert.alert(t('common.success'), t('authScreen.resetSuccess'));
      }
      router.replace('/');
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
        <AuthBrandHeader tagline="KEKE MANAGER" />

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
