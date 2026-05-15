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
import { supabase } from '../lib/supabase';

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
  }, []);

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
      await applySession(data.session ?? null);
      finishHydrate();
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void (async () => {
        if (cancelled) return;
        await applySession(nextSession);
        finishHydrate();
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

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
      }
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    return supabase.auth.signOut();
  }, []);

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
