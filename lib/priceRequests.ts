/**
 * "How much would this cost?" — asked from the app, answered by a person.
 *
 * The company describes a job it has not booked yet; the request goes to KEKE's
 * Telegram through the `price-quote` function and the answer comes back onto
 * this same list, live. Nothing here creates a booking: a quote is a number to
 * take back to the operator, and the booking is made afterwards in the ordinary
 * way, with whatever price was actually agreed.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type PriceRequestKind = 'transfer' | 'day_tour' | 'tour';
export type PriceRequestStatus = 'new' | 'quoted' | 'declined';

export type PriceRequestRow = {
  id: number;
  company_id: string;
  company_name: string | null;
  kind: PriceRequestKind | string;
  from_location: string | null;
  to_location: string | null;
  when_text: string | null;
  days: number | null;
  passengers: number | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  note: string | null;
  status: PriceRequestStatus | string;
  quoted_price_gel: number | null;
  quoted_note: string | null;
  quoted_at: string | null;
  created_at: string;
};

export type NewPriceRequest = {
  kind: PriceRequestKind;
  from_location?: string | null;
  to_location?: string | null;
  when_text?: string | null;
  days?: number | null;
  passengers?: number | null;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
  note?: string | null;
};

export type SubmitResult =
  | { ok: true; id: number; delivered: boolean }
  | { ok: false; error: string };

export async function submitPriceRequest(input: NewPriceRequest): Promise<SubmitResult> {
  const { data, error } = await supabase.functions.invoke('price-quote', { body: input });

  if (error) {
    const ctx = (error as { context?: { body?: unknown } }).context?.body;
    if (typeof ctx === 'string') {
      try {
        const parsed = JSON.parse(ctx) as { error?: string };
        if (parsed.error) return { ok: false, error: parsed.error };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message || 'მოთხოვნა ვერ გაიგზავნა' };
  }

  const res = data as { ok?: boolean; id?: number; delivered?: boolean; error?: string } | null;
  if (!res?.ok || typeof res.id !== 'number') {
    return { ok: false, error: res?.error || 'მოთხოვნა ვერ გაიგზავნა' };
  }
  return { ok: true, id: res.id, delivered: res.delivered === true };
}

export async function fetchMyPriceRequests(
  companyUserId: string,
  limit = 30,
): Promise<{ data: PriceRequestRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('price_requests')
    .select('*')
    .eq('company_id', companyUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data ?? []) as PriceRequestRow[], error: null };
}

/** The answer lands on the open screen without a refresh. */
export function subscribeMyPriceRequests(
  companyUserId: string,
  onChange: () => void,
): RealtimeChannel {
  return supabase
    .channel(`price-requests-${companyUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'price_requests',
        filter: `company_id=eq.${companyUserId}`,
      },
      () => onChange(),
    )
    .subscribe();
}

export function priceRequestRouteSummary(row: PriceRequestRow): string {
  const route = [row.from_location, row.to_location].filter(Boolean).join(' → ');
  return route || row.note?.trim() || '—';
}
