import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Platform } from 'react-native';
import { clearProfilePushToken } from '../lib/profiles';
import { supabase } from '../lib/supabase';

/** Marker: user had a stored session — used to show expiry message vs first-time anonymous open (native only). */
const HAD_SESSION_KEY = '@keke/had_logged_session';

const SESSION_EXPIRED_MESSAGE = 'სესია ამოიწურა, გთხოვთ გაიაროთ ავტორიზაცია';

export type KekeRole = 'driver' | 'company' | 'admin';

export type Profile = {
  id: string;
  role: KekeRole | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  languages: unknown | null;
  balance: number | null;
  rating: number | null;
  is_verified: boolean | null;
  subscription_type: string | null;
  subscription_expires_at: string | null;
  created_at: string | null;
  experience_years: number | null;
  verification_status: string | null;
  license_photo: string | null;
  id_photo: string | null;
  vehicle_registration_photo: string | null;
  rejection_reason: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** True until first session is resolved, or while `user` is set and profile row is loading. */
  loading: boolean;
  signIn: (email: string, password: string) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: KekeRole,
  ) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => ReturnType<typeof supabase.auth.signOut>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) {
    if (__DEV__) {
      console.warn('[AuthContext] fetchProfile', error.message);
    }
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const initialHydrateDone = useRef(false);
  const profileUserIdRef = useRef<string | null>(null);
  const userInitiatedSignOutRef = useRef(false);

  const markHadSessionNative = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await AsyncStorage.setItem(HAD_SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const clearHadSessionMarkerNative = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await AsyncStorage.removeItem(HAD_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const alertSessionExpiredOnce = useCallback(async () => {
    Alert.alert('სესია', SESSION_EXPIRED_MESSAGE);
    await clearHadSessionMarkerNative();
  }, [clearHadSessionMarkerNative]);

  const maybeWarnSessionExpiryOnColdStart = useCallback(async () => {
    if (Platform.OS === 'web' || userInitiatedSignOutRef.current) return;
    try {
      const marker = await AsyncStorage.getItem(HAD_SESSION_KEY);
      if (marker === '1') {
        await alertSessionExpiredOnce();
      }
    } catch {
      /* ignore */
    }
  }, [alertSessionExpiredOnce]);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    const nextUser = next?.user ?? null;
    setUser(nextUser);
    if (!nextUser) {
      profileUserIdRef.current = null;
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    const userChanged = profileUserIdRef.current !== nextUser.id;
    profileUserIdRef.current = nextUser.id;
    void markHadSessionNative();
    if (userChanged) {
      setProfileLoading(true);
    }
    try {
      const row = await fetchProfile(nextUser.id);
      setProfile(row);
    } finally {
      if (userChanged) {
        setProfileLoading(false);
      }
    }
  }, [markHadSessionNative]);

  useEffect(() => {
    let cancelled = false;

    const finishHydrate = () => {
      if (cancelled || initialHydrateDone.current) return;
      initialHydrateDone.current = true;
      setSessionHydrated(true);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        await maybeWarnSessionExpiryOnColdStart();
      }
      await applySession(data.session ?? null);
      finishHydrate();
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      void (async () => {
        if (cancelled) return;

        const signedOutMidSession = event === 'SIGNED_OUT' && !nextSession;

        if (signedOutMidSession && Platform.OS !== 'web' && !userInitiatedSignOutRef.current) {
          try {
            const marker = await AsyncStorage.getItem(HAD_SESSION_KEY);
            if (marker === '1') {
              await alertSessionExpiredOnce();
            }
          } catch {
            /* ignore */
          }
          await clearHadSessionMarkerNative();
        }

        await applySession(nextSession);
        finishHydrate();
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession, alertSessionExpiredOnce, clearHadSessionMarkerNative, maybeWarnSessionExpiryOnColdStart]);

  const loading = !sessionHydrated || (!!user && profileLoading);

  const signIn = useCallback(async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: KekeRole) => {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
      },
    });
    if (!result.error && result.data.user?.id) {
      const userId = result.data.user.id;
      const { error: updateError } = await supabase.from('users').update({ role }).eq('id', userId);
      if (updateError && __DEV__) {
        console.warn('[AuthContext] signUp role update', updateError.message);
      } else {
        const row = await fetchProfile(userId);
        setProfile(row);
        setUser(result.data.user);
        setSession(result.data.session ?? null);
        void markHadSessionNative();
      }
    }
    return result;
  }, [markHadSessionNative]);

  const signOut = useCallback(async () => {
    const uid = user?.id ?? session?.user?.id;
    userInitiatedSignOutRef.current = true;
    await clearHadSessionMarkerNative();
    if (uid) {
      const cleared = await clearProfilePushToken(uid);
      if (!cleared.ok && __DEV__) {
        console.warn('[AuthContext] clearProfilePushToken:', cleared.error?.message);
      }
    }
    try {
      return await supabase.auth.signOut();
    } finally {
      setTimeout(() => {
        userInitiatedSignOutRef.current = false;
      }, 800);
    }
  }, [clearHadSessionMarkerNative, session?.user?.id, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [user, session, profile, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
