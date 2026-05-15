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
import { AppLogo } from '../../components/AppLogo';
import { AuthInput } from '../../components/AuthInput';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';

function mapSupabaseSignInError(err: unknown): string {
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: string }).message)
      : err instanceof Error
        ? err.message
        : '';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'ელფოსტა ან პაროლი არასწორია';
  }
  if (lower.includes('email not confirmed')) {
    return 'ელფოსტა არ არის დადასტურებული';
  }
  if (lower.includes('network request failed')) {
    return 'ინტერნეტთან კავშირი ვერ მოხერხდა';
  }
  if (msg.trim()) return msg;
  return 'შესვლა ვერ მოხერხდა';
}

export default function SignInScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!emailAddress.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await signIn(emailAddress.trim(), password);
      if (signInError) {
        setError(mapSupabaseSignInError(signInError));
        return;
      }
      router.replace('/');
    } catch (err: unknown) {
      setError(mapSupabaseSignInError(err));
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
        <Text style={styles.tagline}>B2B სატრანსპორტო პლატფორმა</Text>

        <View style={styles.card}>
          <Text style={styles.title}>შესვლა</Text>

          <AuthInput
            label="ელფოსტა"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={emailAddress}
            onChangeText={setEmailAddress}
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
            onPress={handleSignIn}
            disabled={loading || !emailAddress.trim() || !password}
            style={({ pressed }) => [
              styles.button,
              SHADOWS.button,
              (loading || !emailAddress.trim() || !password) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <Text style={styles.buttonText}>შესვლა</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerMuted}>ანგარიში არ გაქვთ? </Text>
            <Link href="/sign-up" asChild>
              <Pressable hitSlop={8}>
                <Text style={styles.link}>რეგისტრაცია</Text>
              </Pressable>
            </Link>
          </View>
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
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    ...SHADOWS.card,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
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
