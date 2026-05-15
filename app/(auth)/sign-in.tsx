import { useSignIn } from '@clerk/clerk-expo';
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

function clerkFirstError(err: unknown): { code: string; message: string } {
  if (typeof err === 'object' && err !== null && 'errors' in err) {
    const first = (err as { errors?: { code?: string; message?: string }[] }).errors?.[0];
    return { code: String(first?.code ?? ''), message: String(first?.message ?? '') };
  }
  if (err instanceof Error) return { code: '', message: err.message };
  return { code: '', message: '' };
}

function mapSignInErrorForUser(code: string, rawMessage: string): string {
  switch (code) {
    case 'form_identifier_not_found':
      return 'ანგარიში ვერ მოიძებნა. შეამოწმეთ ელფოსტა ან დარეგისტრირდით.';
    case 'form_password_incorrect':
      return 'პაროლი არასწორია. სცადეთ თავიდან ან გადააყვანეთ პაროლის აღდგენაზე.';
    case 'session_exists':
      return 'სესია უკვე არსებობს. გადატვირთეთ აპლიკაცია ან გამოდით და თავიდან შედით.';
    default:
      break;
  }
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes("couldn't find your account") ||
    lower.includes('couldnt find your account') ||
    lower.includes('could not find your account')
  ) {
    return 'ანგარიში ვერ მოიძებნა. შეამოწმეთ ელფოსტა ან დარეგისტრირდით.';
  }
  const m = rawMessage.trim();
  if (m) return m;
  return 'შეცდომა';
}

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!isLoaded || !signIn) return;
    if (!emailAddress.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      let result = await signIn.create({
        identifier: emailAddress.trim(),
      });
      console.log('SIGNIN STEP1:', result.status);

      const ffv = (result as { firstFactorVerification?: unknown }).firstFactorVerification;
      console.log('FFV:', JSON.stringify(ffv));

      if (result.status === 'complete' || result.createdSessionId) {
        if (result.createdSessionId) {
          await setActive({ session: result.createdSessionId });
          router.replace('/');
          return;
        }
        if (result.status === 'complete') {
          setError('სესია ვერ შეიქმნა');
          return;
        }
      }

      if (result.status === 'needs_first_factor') {
        const attempt = await signIn.attemptFirstFactor({
          strategy: 'password',
          password,
        });
        console.log('ATTEMPT:', attempt.status, attempt.createdSessionId);
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
          router.replace('/');
          return;
        }
        result = attempt;
      }

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace('/');
        return;
      }

      const ffvStrategy =
        ffv && typeof ffv === 'object' && 'strategy' in ffv
          ? String((ffv as { strategy?: string }).strategy ?? '')
          : '';
      if (
        ffvStrategy === 'reset_password_email_code' ||
        ffvStrategy.includes('reset_password')
      ) {
        setError(
          'ახალ მოწყობილობაზე Clerk მოითხოვს პაროლის დადასტურებას ელფოსტით. გამოიყენეთ „დაგავიწყდათ პაროლი“ ან Clerk Dashboard → Password → Client Trust / ახალი კლიენტის პოლიტიკა.',
        );
        return;
      }

      if (result.status === 'needs_second_factor') {
        setError(
          'საჭიროა მეორე დადასტურება (ახალი მოწყობილობა / Client Trust ან 2FA). Clerk Dashboard → User & authentication → Password → გამორთეთ „Client Trust“, ან დაასრულეთ დამატებითი ნაბიჯი Clerk-ის ვებინტერფეისით.',
        );
        return;
      }

      if (result.status === 'needs_new_password') {
        setError(
          'საჭიროა პაროლის განახლება. გადადით Clerk-ის ვებზონაზე ან გამოიყენეთ „დაგავიწყდათ პაროლი“.',
        );
        return;
      }

      console.log('NEEDS MORE:', JSON.stringify(result));
      setError(
        `სტატუსი: ${String(result.status)}. თუ ეს ახალი ტელეფონია, შეამოწმეთ Clerk-ში Client Trust და Email verification პარამეტრები.`,
      );
    } catch (err: unknown) {
      console.log('SIGNIN ERROR:', JSON.stringify(err));
      const { code, message } = clerkFirstError(err);
      console.log('ERROR CODE:', code);
      setError(mapSignInErrorForUser(code, message));
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
        <Text style={styles.logo}>KEKE.MANAGER</Text>
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
              SHADOWS.gold,
              (loading || !emailAddress.trim() || !password) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#000000" />
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
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.gold,
    letterSpacing: 3,
    textAlign: 'center',
  },
  tagline: {
    marginTop: SPACING.sm,
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  card: {
    backgroundColor: 'rgba(26, 26, 46, 0.55)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
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
