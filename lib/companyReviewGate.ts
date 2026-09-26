import { supabase } from './supabase';
import { trimUserId } from './userId';

/**
 * A company must rate the driver after every completed job. Once it owes more
 * than `REVIEW_DEBT_LIMIT` reviews the database refuses new bookings outright
 * (trigger `enforce_company_review_debt`), so this module exists to warn the
 * company *before* it hits that wall and to turn the raw Postgres error into
 * something a person can act on.
 */
export const REVIEW_DEBT_LIMIT = 3;

export type PendingReview = {
  bookingId: string;
  driverId: string | null;
  driverName: string;
  route: string;
  dateDisplay: string | null;
  completedAt: string | null;
};

function rowToPendingReview(row: Record<string, unknown>): PendingReview {
  return {
    bookingId: String(row.booking_id ?? '').trim(),
    driverId: String(row.driver_id ?? '').trim() || null,
    driverName: String(row.driver_name ?? '').trim() || 'მძღოლი',
    route: String(row.route ?? '').trim(),
    dateDisplay: String(row.date_display ?? '').trim() || null,
    completedAt: String(row.completed_at ?? '').trim() || null,
  };
}

/** Completed bookings this company has not rated yet, oldest first. */
export async function fetchPendingReviews(
  companyUserId?: string,
): Promise<{ data: PendingReview[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('company_pending_reviews', {
    p_company_id: trimUserId(companyUserId ?? '') || null,
  });

  if (error) return { data: [], error: new Error(error.message) };
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return {
    data: rows.map(rowToPendingReview).filter((r) => r.bookingId),
    error: null,
  };
}

export async function fetchReviewDebt(companyUserId?: string): Promise<number> {
  const { data, error } = await supabase.rpc('company_review_debt', {
    p_company_id: trimUserId(companyUserId ?? '') || null,
  });
  if (error) return 0;
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type ReviewGateState = {
  debt: number;
  blocked: boolean;
  remaining: number;
  pending: PendingReview[];
};

/**
 * One call for the company panel: how many reviews are owed, whether creating
 * a booking is already blocked, and how many more completions are allowed.
 */
export async function fetchReviewGateState(
  companyUserId?: string,
): Promise<ReviewGateState> {
  const { data: pending } = await fetchPendingReviews(companyUserId);
  const debt = pending.length;
  return {
    debt,
    blocked: debt >= REVIEW_DEBT_LIMIT,
    remaining: Math.max(0, REVIEW_DEBT_LIMIT - debt),
    pending,
  };
}

export function isReviewDebtError(message: string | null | undefined): boolean {
  return String(message ?? '').includes('REVIEW_DEBT');
}

/** Strip the machine prefix so the company sees a sentence, not an error code. */
export function reviewDebtMessage(message: string | null | undefined): string {
  const raw = String(message ?? '').trim();
  const idx = raw.indexOf('REVIEW_DEBT');
  if (idx < 0) return raw;
  const tail = raw.slice(idx + 'REVIEW_DEBT'.length).replace(/^[:\s]+/, '').trim();
  return (
    tail ||
    `${REVIEW_DEBT_LIMIT} შეუფასებელი დასრულებული ჯავშანი გაქვს. გთხოვ შეაფასო მძღოლები, სანამ ახალ ჯავშანს შექმნი.`
  );
}
