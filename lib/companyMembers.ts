import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Table name in Supabase `public` schema — must match DB exactly. */
export const COMPANY_MEMBERS_TABLE = 'company_members' as const;

export type CompanyMember = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
};

function companyId(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

export function formatSupabaseError(error: PostgrestError | Error | null): string {
  if (!error) return 'უცნობი შეცდომა';
  if ('code' in error && error.code) {
    return `${error.message} (${error.code})`;
  }
  return error.message;
}

function logCompanyMembersError(
  operation: string,
  error: PostgrestError | null,
) {
  if (!error || !__DEV__) return;
  console.warn(`[company_members] ${operation}`, error.message);
}

export async function fetchCompanyMembers(companyUserId: string) {
  const cid = companyId(companyUserId);
  if (!cid) {
    return { data: [] as CompanyMember[], error: null };
  }

  const { data, error } = await supabase
    .schema('public')
    .from(COMPANY_MEMBERS_TABLE)
    .select('id, company_id, name, created_at')
    .eq('company_id', cid)
    .order('created_at', { ascending: true });

  if (error) {
    logCompanyMembersError('fetch', error);
  }

  return { data: (data ?? []) as CompanyMember[], error };
}

export async function addCompanyMember(companyUserId: string, name: string) {
  const cid = companyId(companyUserId);
  const trimmed = name.trim();
  if (!cid) {
    return { data: null as CompanyMember | null, error: new Error('company_id არ არის') };
  }
  if (!trimmed) {
    return { data: null, error: new Error('სახელი ცარიელია') };
  }

  const { data, error } = await supabase
    .schema('public')
    .from(COMPANY_MEMBERS_TABLE)
    .insert({ company_id: cid, name: trimmed })
    .select('id, company_id, name, created_at')
    .maybeSingle();

  if (error) {
    logCompanyMembersError('insert', error);
  }

  return { data: data as CompanyMember | null, error };
}

export async function deleteCompanyMember(memberId: string, companyUserId: string) {
  const cid = companyId(companyUserId);
  if (!cid) {
    return { error: new Error('company_id არ არის') };
  }

  const { error } = await supabase
    .schema('public')
    .from(COMPANY_MEMBERS_TABLE)
    .delete()
    .eq('id', memberId)
    .eq('company_id', cid);

  if (error) {
    logCompanyMembersError('delete', error);
  }

  return { error };
}
