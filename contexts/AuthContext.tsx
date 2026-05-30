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
import { resolveAppMenuRole, isHostDriver, type AppMenuRole } from '../lib/menuRole';
import { clearProfilePushToken } from '../lib/profiles';
import { supabase } from '../lib/supabase';
import { fetchVehiclesByDriver, type VehicleRow } from '../lib/vehicles';
import i18n from '../src/lib/i18n';

/** Marker: user had a stored session — used to show expiry message vs first-time anonymous open (native only). */
const HAD_SESSION_KEY = '@keke/had_logged_session';

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
  is_hired_driver: boolean | null;
  is_guide_driver: boolean | null;
  available_for_hire: boolean | null;
  company_email: string | null;
  company_phone: string | null;
  company_id_code: string | null;
  company_director: string | null;
  city: string | null;
  bank_account: string | null;
  current_city: string | null;
  is_available: boolean | null;
  available_updated_at: string | null;
};

export type CompanySignUpMeta = {
  company_email: string;
  company_phone: string;
  company_id_code: string;
  company_director: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Drawer role: company | freelance_driver | hired_driver */
  menuRole: AppMenuRole | null;
  vehicles: VehicleRow[];
  vehicleCount: number;
  /** Freelance driver with 2+ vehicles (dynamic host, not a DB role). */
  isHost: boolean;
  refreshVehicles: () => Promise<void>;
  /** Reload `users` + `profiles` row for the signed-in user (e.g. after admin verification). */
  refreshProfile: () => Promise<void>;
  /** True until first session is resolved, or while `user` is set and profile row is loading. */
  loading: boolean;
  signIn: (email: string, password: string) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: KekeRole,
    options?: {
      isHiredDriver?: boolean;
      isGuideDriver?: boolean;
      company?: CompanySignUpMeta;
      phone?: string;
    },
  ) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => ReturnType<typeof supabase.auth.signOut>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_PROFILE_SELECT =
  'id, role, full_name, email, phone, avatar_url, bio, languages, balance, rating, is_verified, verification_status, subscription_type, subscription_expires_at, created_at, experience_years, license_photo, id_photo, vehicle_registration_photo, rejection_reason, is_hired_driver, is_guide_driver, available_for_hire, company_email, company_phone, company_id_code, company_director, city, bank_account, current_city, is_available, available_updated_at';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const usersRes = await supabase
    .from('users')
    .select(USER_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (usersRes.error) {
    console.error('[AuthContext] fetchProfile users', usersRes.error.message);
    return null;
  }
  if (!usersRes.data) return null;

  const row = usersRes.data as Profile;

  const profilesRes = await supabase
    .from('profiles')
    .select('is_verified')
    .eq('id', userId)
    .maybeSingle();

  if (profilesRes.error) {
    console.warn('[AuthContext] fetchProfile profiles', profilesRes.error.message);
  }

  const profilesVerified = (profilesRes.data as { is_verified?: boolean | null } | null)?.is_verified;
  const isVerified = row.is_verified === true || profilesVerified === true;

  return { ...row, is_verified: isVerified };
}

async function waitForUserRow(
  client: typeof supabase,
  userId: string,
  maxRetries = 10,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await client.from('users').select('id').eq('id', userId).single();
    if (data) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
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
    Alert.alert(i18n.t('system.sessionExpiredTitle'), i18n.t('system.sessionExpiredMessage'));
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

  /** Block UI until session is known and the signed-in user's profile row has loaded. */
  const loading = !sessionHydrated || (!!user && profileLoading);

  const signIn = useCallback(async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: KekeRole,
      options?: {
      isHiredDriver?: boolean;
      isGuideDriver?: boolean;
      company?: CompanySignUpMeta;
      phone?: string;
    },
    ) => {
    const isHiredDriver = role === 'driver' && !!options?.isHiredDriver;
    const isGuideDriver =
      role === 'driver' && !isHiredDriver && !!options?.isGuideDriver;
    const companyMeta = role === 'company' ? options?.company : undefined;
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          is_hired_driver: isHiredDriver,
          is_guide_driver: isGuideDriver,
          ...(companyMeta
            ? {
                company_email: companyMeta.company_email,
                company_phone: companyMeta.company_phone,
                company_id_code: companyMeta.company_id_code,
                company_director: companyMeta.company_director,
              }
            : {}),
        },
      },
    });
    if (!result.error && result.data.user?.id) {
      const userId = result.data.user.id;
      const userPatch: Record<string, unknown> = {
        role,
        is_hired_driver: isHiredDriver,
        is_guide_driver: isGuideDriver,
        full_name: fullName,
        email: email.trim(),
      };
      if (companyMeta) {
        userPatch.company_email = companyMeta.company_email;
        userPatch.company_phone = companyMeta.company_phone;
        userPatch.company_id_code = companyMeta.company_id_code;
        userPatch.company_director = companyMeta.company_director;
      } else if (role === 'driver' && options?.phone?.trim()) {
        userPatch.phone = options.phone.trim();
      }
      const rowReady = await waitForUserRow(supabase, userId);
      if (rowReady) {
        const { error: updateError } = await supabase.from('users').update(userPatch).eq('id', userId);
        if (updateError && __DEV__) {
          console.warn('[AuthContext] signUp role update', updateError.message);
        }
      } else if (__DEV__) {
        console.warn('[AuthContext] signUp: public.users row not ready after retries', userId);
      }
      const row = await fetchProfile(userId);
      if (row) {
        setProfile(row);
        setUser(result.data.user);
        setSession(result.data.session ?? null);
        void markHadSessionNative();
      }
    }
    return result;
  },
    [markHadSessionNative],
  );

  const refreshVehicles = useCallback(async () => {
    const uid = user?.id;
    if (!uid || profile?.role !== 'driver') {
      setVehicles([]);
      return;
    }
    const { data } = await fetchVehiclesByDriver(uid);
    setVehicles(data ?? []);
  }, [user?.id, profile?.role]);

  const refreshProfile = useCallback(async () => {
    const uid = user?.id;
    if (!uid) {
      setProfile(null);
      return;
    }
    const row = await fetchProfile(uid);
    setProfile(row);
  }, [user?.id]);

  useEffect(() => {
    if (profile?.role === 'driver' && user?.id) {
      void refreshVehicles();
    } else {
      setVehicles([]);
    }
  }, [profile?.role, user?.id, refreshVehicles]);

  const menuRole = useMemo(() => resolveAppMenuRole(profile), [profile]);
  const vehicleCount = vehicles.length;
  const isHost = isHostDriver(vehicleCount);

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
      menuRole,
      vehicles,
      vehicleCount,
      isHost,
      refreshVehicles,
      refreshProfile,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [
      user,
      session,
      profile,
      menuRole,
      vehicles,
      vehicleCount,
      isHost,
      refreshVehicles,
      refreshProfile,
      loading,
      signIn,
      signUp,
      signOut,
    ],
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
