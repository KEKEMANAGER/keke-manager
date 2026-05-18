import type { KekeRole } from '../contexts/AuthContext';
import type { BookingRow } from './bookings';
import type { MessageRow } from './messages';
import { getSupabaseAdmin } from './supabaseAdmin';
import { supabase } from './supabase';

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: KekeRole | string | null;
  is_hired_driver: boolean | null;
  is_blocked: boolean | null;
  is_verified: boolean | null;
  verification_status: string | null;
  created_at: string | null;
};

export type AdminStats = {
  totalUsers: number;
  drivers: number;
  hiredDrivers: number;
  companies: number;
  admins: number;
  bookingsTotal: number;
  bookingsCompleted: number;
  revenueGel: number;
  pendingVerifications: number;
};

const USER_LIST_SELECT =
  'id, full_name, email, role, is_hired_driver, is_blocked, is_verified, verification_status, created_at';

export async function fetchAdminUsers(): Promise<{ data: AdminUserRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_LIST_SELECT)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as AdminUserRow[], error: null };
}

function updateError(
  error: { message: string } | null,
  data: { id: string }[] | null,
): Error | null {
  if (error) return new Error(error.message);
  if (!data?.length) {
    return new Error('Update failed — user not found or permission denied');
  }
  return null;
}

export const setAdminUserBlocked = async (
  userId: string,
  isBlocked: boolean,
): Promise<{ error: Error | null }> => {
  const id = userId.trim();
  if (!id) return { error: new Error('user id missing') };

  const { data, error } = await supabase
    .from('users')
    .update({ is_blocked: isBlocked })
    .eq('id', id)
    .select('id');

  return { error: updateError(error, data as { id: string }[] | null) };
};

export const setAdminUserRole = async (
  userId: string,
  role: KekeRole,
): Promise<{ error: Error | null }> => {
  const id = userId.trim();
  if (!id) return { error: new Error('user id missing') };

  const { data, error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', id)
    .select('id');

  return { error: updateError(error, data as { id: string }[] | null) };
};

export const setAdminUserVerified = async (
  userId: string,
  isVerified: boolean,
): Promise<{ error: Error | null }> => {
  const id = userId.trim();
  if (!id) return { error: new Error('user id missing') };

  const patch = isVerified
    ? { is_verified: true, verification_status: 'approved' as const }
    : { is_verified: false, verification_status: 'rejected' as const };

  const { data, error } = await supabase.from('users').update(patch).eq('id', id).select('id');
  const rowErr = updateError(error, data as { id: string }[] | null);
  if (rowErr) return { error: rowErr };

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ is_verified: isVerified })
    .eq('id', id);
  if (profileErr) return { error: new Error(profileErr.message) };
  return { error: null };
};

export const deleteAdminUser = async (userId: string): Promise<{ error: Error | null }> => {
  const id = userId.trim();
  if (!id) return { error: new Error('user id missing') };

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return {
      error: new Error(
        'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env and restart Expo (npx expo start --clear).',
      ),
    };
  }

  const { error: publicErr } = await supabase.from('users').delete().eq('id', id);
  if (publicErr) return { error: new Error(publicErr.message) };

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) return { error: new Error(authErr.message) };

  return { error: null };
};

/** @deprecated Use setAdminUserBlocked / setAdminUserRole */
export const updateAdminUser = async (
  userId: string,
  patch: Partial<{ role: KekeRole; is_blocked: boolean }>,
): Promise<{ error: Error | null }> => {
  if (patch.is_blocked !== undefined) {
    return setAdminUserBlocked(userId, patch.is_blocked);
  }
  if (patch.role !== undefined) {
    return setAdminUserRole(userId, patch.role);
  }
  return { error: null };
};

export async function fetchAdminStats(): Promise<{ data: AdminStats; error: Error | null }> {
  const [usersRes, bookingsRes] = await Promise.all([
    supabase.from('users').select('role, is_hired_driver, verification_status'),
    supabase.from('bookings').select('status, price_gel'),
  ]);

  if (usersRes.error) return { data: emptyStats(), error: new Error(usersRes.error.message) };
  if (bookingsRes.error) return { data: emptyStats(), error: new Error(bookingsRes.error.message) };

  const users = (usersRes.data ?? []) as {
    role: string | null;
    is_hired_driver: boolean | null;
    verification_status: string | null;
  }[];
  const bookings = (bookingsRes.data ?? []) as { status: string; price_gel: number }[];

  let drivers = 0;
  let hiredDrivers = 0;
  let companies = 0;
  let admins = 0;
  let pendingVerifications = 0;

  for (const u of users) {
    if (u.role === 'driver') {
      drivers++;
      if (u.is_hired_driver) hiredDrivers++;
    } else if (u.role === 'company') companies++;
    else if (u.role === 'admin') admins++;
    if (u.verification_status === 'pending' || u.verification_status === 'submitted') {
      pendingVerifications++;
    }
  }

  let bookingsCompleted = 0;
  let revenueGel = 0;
  for (const b of bookings) {
    if (b.status === 'completed') {
      bookingsCompleted++;
      revenueGel += Number(b.price_gel) || 0;
    }
  }

  return {
    data: {
      totalUsers: users.length,
      drivers,
      hiredDrivers,
      companies,
      admins,
      bookingsTotal: bookings.length,
      bookingsCompleted,
      revenueGel,
      pendingVerifications,
    },
    error: null,
  };
}

function emptyStats(): AdminStats {
  return {
    totalUsers: 0,
    drivers: 0,
    hiredDrivers: 0,
    companies: 0,
    admins: 0,
    bookingsTotal: 0,
    bookingsCompleted: 0,
    revenueGel: 0,
    pendingVerifications: 0,
  };
}

export async function fetchAdminBookings(limit = 150): Promise<{
  data: BookingRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as BookingRow[], error: null };
}

export type AdminMessageView = MessageRow & {
  sender_name: string | null;
  receiver_name: string | null;
};

export async function fetchAdminMessages(limit = 200): Promise<{
  data: AdminMessageView[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: new Error(error.message) };

  const rows = (data ?? []) as MessageRow[];
  const ids = new Set<string>();
  for (const m of rows) {
    ids.add(m.sender_id);
    ids.add(m.receiver_id);
  }
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', Array.from(ids));

  const nameMap = new Map<string, string | null>();
  for (const u of (users ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    nameMap.set(u.id, u.full_name?.trim() || u.email);
  }

  return {
    data: rows.map((m) => ({
      ...m,
      sender_name: nameMap.get(m.sender_id) ?? null,
      receiver_name: nameMap.get(m.receiver_id) ?? null,
    })),
    error: null,
  };
}

export async function deleteAdminMessage(messageId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  return { error: error ? new Error(error.message) : null };
}
