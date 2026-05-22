import { supabase } from './supabase';

export type AdCard = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
};

type AdRow = AdCard & {
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

function isAdVisibleNow(row: AdRow, nowMs: number): boolean {
  if (!row.is_active) return false;
  if (row.starts_at) {
    const start = new Date(row.starts_at).getTime();
    if (!Number.isNaN(start) && start > nowMs) return false;
  }
  if (row.ends_at) {
    const end = new Date(row.ends_at).getTime();
    if (!Number.isNaN(end) && end < nowMs) return false;
  }
  return true;
}

/** Active partner ads for dashboard carousel (public read via RLS). */
export async function fetchActiveAds(): Promise<AdCard[]> {
  const { data, error } = await supabase
    .from('ads')
    .select('id, title, subtitle, image_url, link_url, is_active, starts_at, ends_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    if (__DEV__) console.warn('[fetchActiveAds]', error.message);
    return [];
  }

  const nowMs = Date.now();
  return ((data ?? []) as AdRow[])
    .filter((row) => isAdVisibleNow(row, nowMs))
    .map(({ id, title, subtitle, image_url, link_url }) => ({
      id,
      title,
      subtitle,
      image_url,
      link_url,
    }));
}
