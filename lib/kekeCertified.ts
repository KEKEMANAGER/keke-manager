import { supabase } from './supabase';
import { USERS_DIRECTORY } from './usersDirectory';

/**
 * KEKE Certified: a driver the admin has certified after the KEKE training and
 * a short test. Stored as `users.keke_certified_at` (null = not certified),
 * which only an admin can set (`admin_set_keke_certified`, guarded in the
 * database). Companies see it through `users_directory`; dispatch puts these
 * drivers ahead of the others in the first wave (lib/driverRatingSort.ts).
 */
export function isKekeCertified(certifiedAt: string | null | undefined): boolean {
  return typeof certifiedAt === 'string' && certifiedAt.trim().length > 0;
}

/**
 * The certified drivers among these ids, read from the directory every signed-in
 * user can see. Asked separately from every other driver query on purpose: an
 * error here (an older database, a network blip) leaves nobody certified and
 * everything else exactly as it was.
 */
export async function fetchCertifiedDriverIds(driverIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(driverIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from(USERS_DIRECTORY)
    .select('id, keke_certified_at')
    .in('id', ids)
    .not('keke_certified_at', 'is', null);
  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    data
      .filter((row) => isKekeCertified((row as { keke_certified_at?: string | null }).keke_certified_at))
      .map((row) => String((row as { id: string }).id)),
  );
}

/** Admin only: certify a driver, or take it away. Returns the new date (null when removed). */
export async function setKekeCertified(
  driverId: string,
  certified: boolean,
): Promise<{ certifiedAt: string | null; error: Error | null }> {
  const id = driverId.trim();
  if (!id) return { certifiedAt: null, error: new Error('driver id missing') };
  const { data, error } = await supabase.rpc('admin_set_keke_certified', {
    p_user_id: id,
    p_certified: certified,
  });
  if (error) return { certifiedAt: null, error: new Error(error.message) };
  const at = typeof data === 'string' && data.trim() ? data.trim() : null;
  return { certifiedAt: at, error: null };
}

/** Admin: when this user was certified, read from `users` itself. Null when not, or on any error. */
export async function fetchKekeCertifiedAt(userId: string): Promise<string | null> {
  const id = userId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('users')
    .select('keke_certified_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const at = (data as { keke_certified_at?: string | null }).keke_certified_at;
  return isKekeCertified(at) ? String(at).trim() : null;
}

/** Admin: the certified ones among these users, read from `users`. Empty on any error. */
export async function fetchCertifiedUserIdsForAdmin(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('users')
    .select('id, keke_certified_at')
    .in('id', ids)
    .not('keke_certified_at', 'is', null);
  if (error || !Array.isArray(data)) return new Set();
  return new Set(
    data
      .filter((row) => isKekeCertified((row as { keke_certified_at?: string | null }).keke_certified_at))
      .map((row) => String((row as { id: string }).id)),
  );
}
