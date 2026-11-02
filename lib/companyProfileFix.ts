import { supabase } from './supabase';

/**
 * What KEKE Manager asked a company to correct before it may go on using the
 * app (users.profile_fix, set by an admin — see
 * supabase/migrations/20261102140000_company_profile_fix.sql). The server lets
 * the company back in by itself the moment everything asked for is in place.
 */
export type ProfileFixField = 'company_name' | 'logo';

export type ProfileFixRequest = {
  fields: ProfileFixField[];
  /** The company name that has to be replaced (a person's name, say). */
  nameWas: string | null;
};

const FIELDS: readonly ProfileFixField[] = ['company_name', 'logo'];

export function parseProfileFix(raw: unknown): ProfileFixRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { fields?: unknown; name_was?: unknown };
  const fields = Array.isArray(r.fields)
    ? FIELDS.filter((f) => (r.fields as unknown[]).includes(f))
    : [];
  if (fields.length === 0) return null;
  const nameWas = typeof r.name_was === 'string' && r.name_was.trim() ? r.name_was.trim() : null;
  return { fields, nameWas };
}

/**
 * What is still missing, by the same rule the server applies: a company name
 * of at least two letters other than the one to be replaced (letter case and
 * spaces aside), and a logo that is a picture link.
 */
export function profileFixMissing(
  fix: ProfileFixRequest,
  companyName: string | null | undefined,
  logoUrl: string | null | undefined,
): ProfileFixField[] {
  const missing: ProfileFixField[] = [];
  if (fix.fields.includes('company_name')) {
    const name = (companyName ?? '').trim();
    const was = (fix.nameWas ?? '').trim().toLowerCase();
    if (Array.from(name).length < 2 || name.toLowerCase() === was) missing.push('company_name');
  }
  if (fix.fields.includes('logo') && !/^https?:\/\//i.test((logoUrl ?? '').trim())) missing.push('logo');
  return missing;
}

/**
 * The request on this account, if any. Read on its own (not with the
 * profile) so that an app running before the column exists simply sees none.
 */
export async function fetchProfileFix(userId: string): Promise<ProfileFixRequest | null> {
  const id = userId.trim();
  if (!id) return null;
  const { data, error } = await supabase.from('users').select('profile_fix').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return parseProfileFix((data as { profile_fix?: unknown }).profile_fix);
}

export async function saveCompanyName(userId: string, name: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update({ full_name: name.trim() }).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}
