import { supabase } from './supabase';

export const ACCOUNT_BLOCKED_ERROR = 'account_blocked';

export async function fetchUserIsBlocked(userId: string): Promise<boolean> {
  const id = userId.trim();
  if (!id) return false;
  const { data, error } = await supabase
    .from('users')
    .select('is_blocked')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (__DEV__) console.warn('[accountBlocked] fetch failed:', error.message);
    return false;
  }
  return (data as { is_blocked?: boolean | null } | null)?.is_blocked === true;
}

export function accountBlockedAuthError(): Error {
  return new Error(ACCOUNT_BLOCKED_ERROR);
}
