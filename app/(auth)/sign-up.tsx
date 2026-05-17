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
  type SignUpAccountType,
  type SignUpFieldErrors,
} from '../../lib/validation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppLogo } from '../../components/AppLogo';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../../constants/theme';
import { useAuth, type KekeRole } from '../../contexts/AuthContext';
import { getUserRole } from '../../lib/role';

const ACCOUNT_OPTIONS: {
  type: SignUpAccountType;
  emoji: string;
  titleKey: string;
  hintKey: string;
}[] = [
  {
    type: 'freelance_driver',
    emoji: '🚗',
    titleKey: 'roleFreelanceDriver',
    hintKey: 'roleFreelanceDriverHint',
  },
  {
    type: 'hired_driver',
    emoji: '👤',
    titleKey: 'roleHiredDriver',
    hintKey: 'roleHiredDriverHint',
  },
  {
    type: 'company',
    emoji: '🏢',
    titleKey: 'roleCompany',
    hintKey: 'roleCompanyHint',
  },
];

function accountTypeToRole(type: SignUpAccountType): KekeRole {
  return type === 'company' ? 'company' : 'driver';
}

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading, signUp } = useAuth();
  const existingRole = getUserRole(profile);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [accountType, setAccountType] = useState<SignUpAccountType | null>(null);
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

  const formReady =
    !!accountType && !!fullName.trim() && !!email.trim() && !!password && !isSubmitting;

  async function onRegister() {
    if (isSubmitting) return;

    const fields = validateSignUpFields({
      accountType,
      fullName,
      email,
      password,
    });
    setFieldErrors(fields);
    if (fields.accountType || fields.fullName || fields.email || fields.password) {
      const first =
        fields.accountType ?? fields.fullName ?? fields.email ?? fields.password ?? '';
      setError(first);
      showValidationAlert(first);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const type = accountType!;
      const role = accountTypeToRole(type);
      const { error: signUpError } = await signUp(email.trim(), password, fullName.trim(), role, {
        isHiredDriver: type === 'hired_driver',
      });
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
        <View style={styles.roleList}>
          {ACCOUNT_OPTIONS.map((opt) => {
            const selected = accountType === opt.type;
            return (
              <Pressable
                key={opt.type}
                onPress={() => setAccountType(opt.type)}
                style={({ pressed }) => [
                  styles.roleCard,
                  SHADOWS.card,
                  selected && styles.roleCardActive,
                  pressed && styles.roleCardPressed,
                ]}
              >
                <Text style={styles.roleEmoji}>{opt.emoji}</Text>
                <Text style={[styles.roleTitle, selected && styles.roleTitleActive]}>
                  {t(`authScreen.${opt.titleKey}`)}
                </Text>
                <Text style={styles.roleHint}>{t(`authScreen.${opt.hintKey}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.accountType ? (
          <Text style={styles.fieldError}>{fieldErrors.accountType}</Text>
        ) : null}

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
            disabled={!formReady}
            style={({ pressed }) => [
              styles.button,
              SHADOWS.button,
              !formReady && styles.buttonDisabled,
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
  roleList: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  roleCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  roleCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldTint,
  },
  roleCardPressed: {
    opacity: 0.92,
  },
  roleEmoji: {
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  roleTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  roleTitleActive: {
    color: COLORS.goldDark,
  },
  roleHint: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
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
