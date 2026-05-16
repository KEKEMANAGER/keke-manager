import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getSupabaseErrorMessage } from '../../lib/errorHandler';
import {
  showErrorAlert,
  showValidationAlert,
  validateSignUpFields,
  type SignUpFieldErrors,
} from '../../lib/validation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../../components/AppLogo';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { useAuth, type KekeRole } from '../../contexts/AuthContext';
import { getUserRole } from '../../lib/role';

type Role = KekeRole;

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading, signUp } = useAuth();
  const existingRole = getUserRole(profile);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignUpFieldErrors>({});

  useEffect(() => {
    if (authLoading) return;
    if (user && existingRole) {
      router.replace('/');
    }
  }, [authLoading, user, existingRole, router]);

  if (authLoading || (user && existingRole)) {
    return (
      <View style={[styles.flex, styles.centerSpinner]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  async function onRegister() {
    if (isSubmitting) return;

    const fields = validateSignUpFields({
      role,
      fullName,
      email,
      password,
    });
    setFieldErrors(fields);
    if (fields.role || fields.fullName || fields.email || fields.password) {
      const first = fields.role ?? fields.fullName ?? fields.email ?? fields.password ?? '';
      setError(first);
      showValidationAlert(first);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await signUp(email.trim(), password, fullName.trim(), role!);
      if (signUpError) {
        const message = getSupabaseErrorMessage(signUpError);
        setError(message);
        showErrorAlert(message);
        return;
      }
      router.replace('/');
    } catch (e: unknown) {
      const message = getSupabaseErrorMessage(e);
      setError(message);
      showErrorAlert(message);
    } finally {
      setIsSubmitting(false);
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
          { paddingTop: insets.top + SPACING.lg, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppLogo size="auth" />
        <Text style={styles.stepTitle}>{t('authScreen.signUp')}</Text>

        <Text style={styles.sectionLabel}>{t('authScreen.selectRole')}</Text>
        <View style={styles.roleRow}>
          <Pressable
            onPress={() => setRole('driver')}
            style={({ pressed }) => [
              styles.roleCard,
              role === 'driver' && styles.roleCardActive,
              pressed && styles.roleCardPressed,
            ]}
          >
            <Text style={styles.roleEmoji}>🧑‍💼</Text>
            <Text style={[styles.roleTitle, role === 'driver' && styles.roleTitleActive]}>
              {t('authScreen.roleDriver')}
            </Text>
            <Text style={styles.roleHint}>{t('authScreen.roleDriverHint')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setRole('company')}
            style={({ pressed }) => [
              styles.roleCard,
              role === 'company' && styles.roleCardActive,
              pressed && styles.roleCardPressed,
            ]}
          >
            <Text style={styles.roleEmoji}>🏢</Text>
            <Text style={[styles.roleTitle, role === 'company' && styles.roleTitleActive]}>
              {t('authScreen.roleCompany')}
            </Text>
            <Text style={styles.roleHint}>{t('authScreen.roleCompanyHint')}</Text>
          </Pressable>
        </View>
        {fieldErrors.role ? <Text style={styles.fieldError}>{fieldErrors.role}</Text> : null}

        <View style={styles.card}>
          <AuthInput
            label={t('authScreen.fullName')}
            value={fullName}
            onChangeText={setFullName}
            error={fieldErrors.fullName}
          />
          <AuthInput
            label={t('auth.email')}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={onRegister}
            disabled={
              isSubmitting || !role || !fullName.trim() || !email.trim() || !password
            }
            style={({ pressed }) => [
              styles.button,
              SHADOWS.button,
              (isSubmitting || !role || !fullName.trim() || !email.trim() || !password) &&
                styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>{t('authScreen.signUp')}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerMuted}>{t('authScreen.haveAccount')} </Text>
          <Link href="/sign-in" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.link}>{t('authScreen.signIn')}</Text>
            </Pressable>
          </Link>
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
  centerSpinner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleHelp: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  roleCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  roleCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.06)',
  },
  roleCardPressed: {
    opacity: 0.92,
  },
  roleEmoji: {
    fontSize: 28,
    marginBottom: SPACING.sm,
  },
  roleTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  roleTitleActive: {
    color: COLORS.goldDark,
  },
  roleHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: SPACING.sm,
    marginTop: -SPACING.xs,
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
});
