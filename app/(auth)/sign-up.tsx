import { useAuth, useSignUp, useUser } from '@clerk/clerk-expo';
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
import { AuthInput } from '../../components/AuthInput';
import { COLORS, SHADOWS, SPACING } from '../../constants/theme';
import { getUserRole, type KekeRole } from '../../lib/role';

/** Instant signup: Clerk has “Verify at sign-up” off → `signUp.create` should end with `status === 'complete'`. */
type Role = KekeRole;

function CompleteRoleForSignedInUser({
  user,
}: {
  user: NonNullable<ReturnType<typeof useUser>['user']>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSaveRole() {
    if (!role) return;
    setError(null);
    setSubmitting(true);
    try {
      const prev =
        typeof user.unsafeMetadata === 'object' && user.unsafeMetadata !== null
          ? (user.unsafeMetadata as Record<string, unknown>)
          : {};
      await user.update({
        unsafeMetadata: { ...prev, role },
      });
      router.replace(role === 'driver' ? '/(driver)/dashboard' : '/(app)/dashboard');
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'errors' in e
          ? String((e as { errors?: { message?: string }[] }).errors?.[0]?.message)
          : e instanceof Error
            ? e.message
            : 'როლის შენახვა ვერ მოხერხდა';
      setError(msg);
    } finally {
      setSubmitting(false);
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
        <Text style={styles.logo}>KEKE.MANAGER</Text>
        <Text style={styles.stepTitle}>როლის არჩევა</Text>
        <Text style={styles.roleHelp}>
          თქვენს ანგარიშს ჯერ არ აქვს როლი. აირჩიეთ მძღოლი ან კომპანია გასაგრძელებლად.
        </Text>

        <Text style={styles.sectionLabel}>აირჩიეთ როლი</Text>
        <View style={styles.roleRow}>
          <Pressable
            onPress={() => setRole('driver')}
            style={({ pressed }) => [
              styles.roleCard,
              role === 'driver' && styles.roleCardActive,
              pressed && styles.roleCardPressed,
            ]}
          >
            <Text style={styles.roleEmoji}>🚚</Text>
            <Text style={[styles.roleTitle, role === 'driver' && styles.roleTitleActive]}>
              მძღოლი
            </Text>
            <Text style={styles.roleHint}>ინდივიდუალური გადაზიდვები</Text>
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
              კომპანია
            </Text>
            <Text style={styles.roleHint}>B2B ლოგისტიკა</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onSaveRole}
          disabled={submitting || !role}
          style={({ pressed }) => [
            styles.button,
            SHADOWS.gold,
            (submitting || !role) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.buttonText}>შენახვა და გაგრძელება</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function splitName(full: string): { firstName: string; lastName: string } {
  const t = full.trim();
  const i = t.indexOf(' ');
  if (i === -1) return { firstName: t || 'User', lastName: '' };
  return {
    firstName: t.slice(0, i).trim(),
    lastName: t.slice(i + 1).trim(),
  };
}

function postAuthDestination(r: Role): '/(driver)/dashboard' | '/(app)/dashboard' {
  return r === 'driver' ? '/(driver)/dashboard' : '/(app)/dashboard';
}

function safeStringifyRegistrationError(err: unknown): string {
  try {
    if (typeof err === 'object' && err !== null && 'errors' in err) {
      return JSON.stringify(err);
    }
    if (err instanceof Error) {
      return JSON.stringify({ message: err.message, name: err.name });
    }
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function clerkFirstError(e: unknown): { code: string; message: string } {
  if (typeof e === 'object' && e !== null && 'errors' in e) {
    const first = (e as { errors?: { code?: string; message?: string }[] }).errors?.[0];
    return { code: String(first?.code ?? ''), message: String(first?.message ?? '') };
  }
  if (e instanceof Error) return { code: '', message: e.message };
  return { code: '', message: '' };
}

/** User-visible Georgian text for common Clerk sign-up API errors (mobile-friendly). */
function mapSignUpErrorForUser(code: string, rawMessage: string): string {
  switch (code) {
    case 'form_password_pwned':
      return 'ეს პაროლი საჯარო მონაცემთა გაჟონვის ბაზაშია ნაპოვნი. უსაფრთხოებისთვის აირჩიეთ სხვა, ძლიერი პაროლი (უნიკალური კომბინაცია).';
    case 'form_identifier_exists':
      return 'ეს ელფოსტა უკვე რეგისტრირებულია — გადადით „შესვლაზე“ ან გამოიყენეთ სხვა ელფოსტა.';
    case 'form_password_length_too_short':
      return 'პაროლი ძალიან მოკლეა. გაზარდეთ სიგრძე ან დაამატეთ სიმბოლოები/ციფრები.';
    case 'form_password_not_strong_enough':
      return 'პაროლი საკმარისად ძლიერი არ არის. დაამატეთ სიმბოლოები, ციფრები ან სიგრძე.';
    default:
      break;
  }
  const m = rawMessage.trim();
  if (m) return m;
  return 'რეგისტრაცია ვერ მოხერხდა';
}

export default function SignUpScreen() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingRole = getUserRole(user);
  const showRoleOnly =
    authLoaded && userLoaded && !!userId && !!user && !existingRole;

  if (showRoleOnly && user) {
    return <CompleteRoleForSignedInUser user={user} />;
  }

  if (authLoaded && userId && !userLoaded) {
    return (
      <View style={[styles.flex, styles.centerSpinner]}>
        <ActivityIndicator color={COLORS.gold} size="large" />
      </View>
    );
  }

  async function onRegister() {
    if (!isLoaded || !signUp || !role) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { firstName, lastName } = splitName(fullName);
      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName,
        ...(lastName ? { lastName } : {}),
        unsafeMetadata: { role },
      });

      if (signUp.status === 'complete') {
        if (!signUp.createdSessionId) {
          setError('სესია ვერ შეიქმნა. სცადეთ თავიდან.');
          return;
        }
        await setActive({ session: signUp.createdSessionId });
        router.replace(postAuthDestination(role));
        return;
      }

      setError(
        `რეგისტრაცია ვერ დასრულდა (სტატუსი: ${String(signUp.status)}). შეამოწმეთ Clerk → Email → Verify at sign-up გამორთულია.`,
      );
    } catch (e: unknown) {
      console.log('registration error:', safeStringifyRegistrationError(e));
      const { code, message } = clerkFirstError(e);
      setError(mapSignUpErrorForUser(code, message));
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
        <Text style={styles.logo}>KEKE.MANAGER</Text>
        <Text style={styles.stepTitle}>რეგისტრაცია</Text>

        <Text style={styles.sectionLabel}>აირჩიეთ როლი</Text>
        <View style={styles.roleRow}>
          <Pressable
            onPress={() => setRole('driver')}
            style={({ pressed }) => [
              styles.roleCard,
              role === 'driver' && styles.roleCardActive,
              pressed && styles.roleCardPressed,
            ]}
          >
            <Text style={styles.roleEmoji}>🚚</Text>
            <Text style={[styles.roleTitle, role === 'driver' && styles.roleTitleActive]}>
              მძღოლი
            </Text>
            <Text style={styles.roleHint}>ინდივიდუალური გადაზიდვები</Text>
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
              კომპანია
            </Text>
            <Text style={styles.roleHint}>B2B ლოგისტიკა</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <AuthInput label="სრული სახელი" value={fullName} onChangeText={setFullName} />
          <AuthInput
            label="ელფოსტა"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <AuthInput
            label="პაროლი"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={onRegister}
            disabled={
              isSubmitting || !role || !fullName.trim() || !email.trim() || !password
            }
            style={({ pressed }) => [
              styles.button,
              SHADOWS.gold,
              (isSubmitting || !role || !fullName.trim() || !email.trim() || !password) &&
                styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.buttonText}>რეგისტრაცია</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerMuted}>უკვე გაქვთ ანგარიში? </Text>
          <Link href="/sign-in" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.link}>შესვლა</Text>
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
    color: COLORS.grayLight,
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
  logo: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.grayLight,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  roleCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  roleCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(245, 166, 35, 0.08)',
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
    color: COLORS.white,
    marginBottom: 4,
  },
  roleTitleActive: {
    color: COLORS.goldLight,
  },
  roleHint: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'rgba(26, 26, 46, 0.55)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  button: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#000000',
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
    color: COLORS.gray,
    fontSize: 15,
  },
  link: {
    color: COLORS.goldLight,
    fontSize: 15,
    fontWeight: '700',
  },
});
