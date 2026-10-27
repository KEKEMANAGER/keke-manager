import { supabase } from './supabase';
import { fetchCertifiedDriverIds } from './kekeCertified';

export type DriverRatingScore = { average: number; count: number };

export type MatchDriverRatingFields = {
  full_name?: string | null;
  rating?: string | null;
  rating_count?: number;
};

/**
 * Dispatch order is NOT the raw star average.
 *
 * A raw average locks the platform: a new driver sits at 0, never gets a job,
 * never earns a review, and stays at 0 forever — while one lucky 5★ outranks a
 * driver with two hundred jobs at 4.8. `public.driver_rank_scores()` returns a
 * composite instead:
 *
 *   60%  stars, Bayesian-smoothed toward the platform mean
 *   25%  confirmation rate  (does he answer when a job is assigned?)
 *   15%  completion rate    (does he finish what he takes?)
 *
 * The stars a company SEES stay the honest raw average (`display_rating`);
 * only the queue order uses the composite.
 */
export type DriverRankScore = {
  driverId: string;
  displayRating: number;
  ratingCount: number;
  bayesRating: number;
  confirmRate: number;
  completionRate: number;
  completedCount: number;
  isNewDriver: boolean;
  rankScore: number;
  lastDispatchedAt: string | null;
};

/** A driver below this many completed jobs still needs a way in. */
export const NEW_DRIVER_WAVE1_SLOTS = 2;

export function computeRatingAveragesFromRows(
  rows: { driver_id: string; overall: number }[],
): Map<string, DriverRatingScore> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const id = String(row.driver_id);
    const prev = acc.get(id) ?? { sum: 0, count: 0 };
    prev.sum += Number(row.overall);
    prev.count += 1;
    acc.set(id, prev);
  }
  const out = new Map<string, DriverRatingScore>();
  for (const [id, { sum, count }] of acc) {
    out.set(id, {
      average: Math.round((sum / count) * 10) / 10,
      count,
    });
  }
  return out;
}

function ratingScoreFromMatchingDriver(driver: MatchDriverRatingFields): DriverRatingScore {
  const parsed = driver.rating != null ? Number.parseFloat(driver.rating) : Number.NaN;
  return {
    average: Number.isFinite(parsed) ? parsed : 0,
    count: driver.rating_count ?? 0,
  };
}

function compareRatingScores(a: DriverRatingScore, b: DriverRatingScore): number {
  if (b.average !== a.average) return b.average - a.average;
  if (b.count !== a.count) return b.count - a.count;
  return 0;
}

export function compareMatchingDriversByRating(
  a: MatchDriverRatingFields,
  b: MatchDriverRatingFields,
): number {
  const byRating = compareRatingScores(
    ratingScoreFromMatchingDriver(a),
    ratingScoreFromMatchingDriver(b),
  );
  if (byRating !== 0) return byRating;
  return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ka');
}

export function compareMatchingDriversByName(
  a: MatchDriverRatingFields,
  b: MatchDriverRatingFields,
): number {
  return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ka');
}

export function sortMatchingDrivers<T extends MatchDriverRatingFields>(
  drivers: T[],
  sortMode: 'name' | 'rating',
): T[] {
  const sorted = [...drivers];
  sorted.sort(sortMode === 'rating' ? compareMatchingDriversByRating : compareMatchingDriversByName);
  return sorted;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function rowToRankScore(row: Record<string, unknown>): DriverRankScore {
  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    driverId: String(row.driver_id ?? '').trim(),
    displayRating: num(row.display_rating),
    ratingCount: num(row.rating_count),
    bayesRating: num(row.bayes_rating),
    confirmRate: num(row.confirm_rate),
    completionRate: num(row.completion_rate),
    completedCount: num(row.completed_count),
    isNewDriver: row.is_new_driver === true,
    rankScore: num(row.rank_score),
    lastDispatchedAt: String(row.last_dispatched_at ?? '').trim() || null,
  };
}

/** Composite dispatch scores, keyed by driver id. */
export async function fetchDriverRankScores(
  driverIds: string[],
): Promise<Map<string, DriverRankScore>> {
  const ids = uniqueIds(driverIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.rpc('driver_rank_scores', {
    p_driver_ids: ids,
  });
  if (error || !Array.isArray(data)) return new Map();

  const out = new Map<string, DriverRankScore>();
  for (const row of data as Record<string, unknown>[]) {
    const score = rowToRankScore(row);
    if (score.driverId) out.set(score.driverId, score);
  }
  return out;
}

/** Raw star averages — what a company is shown, not what the queue uses. */
export async function fetchDriverRatingScores(
  driverIds: string[],
): Promise<Map<string, DriverRatingScore>> {
  const ids = uniqueIds(driverIds);
  if (ids.length === 0) return new Map();

  const ranked = await fetchDriverRankScores(ids);
  if (ranked.size > 0) {
    const out = new Map<string, DriverRatingScore>();
    for (const [id, s] of ranked) {
      out.set(id, { average: s.displayRating, count: s.ratingCount });
    }
    return out;
  }

  // Fallback for an older database without the scoring function.
  const { data, error } = await supabase
    .from('ratings')
    .select('driver_id, overall')
    .in('driver_id', ids);

  if (error || !data?.length) return new Map();
  return computeRatingAveragesFromRows(data as { driver_id: string; overall: number }[]);
}

export type PushRecipientLike = {
  userId: string;
  token: string;
  /**
   * False only for a driver who has narrowed his own coverage and this job
   * falls outside it. Undefined — the normal case — means no opinion, and the
   * driver is ranked exactly as he was before coverage existed.
   */
  coversRegion?: boolean;
  /**
   * True for a driver who finishes another job near this pickup shortly before
   * it starts. Undefined — the normal case — means no opinion. Like coverage,
   * it only ever sorts.
   */
  endsNearPickup?: boolean;
};

/** A driver who said "not my area" waits; everyone else keeps their place. */
function coverageTier(recipient: PushRecipientLike): number {
  return recipient.coversRegion === false ? 1 : 0;
}

/**
 * A driver who is already going to be standing there goes first.
 *
 * He drops a group in Kazbegi at one and would otherwise drive back to Tbilisi
 * empty; a two o'clock job out of Kazbegi costs him nothing and costs the
 * company nothing to position. That is a better match than any score can see,
 * so it is asked before the score — but after coverage, because a driver who
 * has said he does not work a region has told us something about himself that
 * his calendar has not.
 *
 * Like every tier here it only sorts. Wave 1 still fills to the same size and
 * wave 2 still carries everyone else, so nobody is skipped because someone
 * happened to be nearby.
 */
function emptyLegTier(recipient: PushRecipientLike): number {
  return recipient.endsNearPickup === true ? 0 : 1;
}

/**
 * A KEKE Certified driver goes before one who is not — after coverage and the
 * empty leg, which say where a driver can be, and before the score, which says
 * how well he has done. Like the other tiers it only sorts.
 */
function certifiedTier(recipient: PushRecipientLike, certified: Set<string>): number {
  return certified.has(recipient.userId) ? 0 : 1;
}

function compareByRank(
  a: DriverRankScore | undefined,
  b: DriverRankScore | undefined,
  fallbackA: string,
  fallbackB: string,
): number {
  const ra = a?.rankScore ?? 0;
  const rb = b?.rankScore ?? 0;
  if (rb !== ra) return rb - ra;

  // Equal score: whoever has waited longest since their last dispatch goes
  // first, so identical newcomers rotate instead of one always winning.
  const la = a?.lastDispatchedAt ? Date.parse(a.lastDispatchedAt) : 0;
  const lb = b?.lastDispatchedAt ? Date.parse(b.lastDispatchedAt) : 0;
  if (la !== lb) return la - lb;

  return fallbackA.localeCompare(fallbackB);
}

export async function sortPushRecipientsByRating<T extends PushRecipientLike>(
  recipients: T[],
): Promise<T[]> {
  if (recipients.length <= 1) return recipients;

  const scores = await fetchDriverRankScores(recipients.map((r) => r.userId));

  return [...recipients].sort((a, b) =>
    compareByRank(scores.get(a.userId), scores.get(b.userId), a.userId, b.userId),
  );
}

/**
 * Split recipients into the first push wave and the rest.
 *
 * The top of the list is earned, but a couple of wave-1 seats are reserved for
 * drivers who have not completed five jobs yet. Without that reservation the
 * same faces win every booking and nobody new can ever build a record.
 */
export async function buildRatingWaves<T extends PushRecipientLike>(
  recipients: T[],
  wave1Size: number,
  newDriverSlots = NEW_DRIVER_WAVE1_SLOTS,
): Promise<{
  wave1: T[];
  wave2: T[];
  scores: Map<string, DriverRankScore>;
  certified: Set<string>;
}> {
  const ids = recipients.map((r) => r.userId);
  const [scores, certified] = await Promise.all([
    fetchDriverRankScores(ids),
    fetchCertifiedDriverIds(ids),
  ]);
  const sorted = [...recipients].sort((a, b) => {
    // Coverage comes before score, but it only ever sorts — never excludes.
    // Wave 1 still fills to wave1Size and wave 2 still carries everyone else,
    // so a job in a region nobody claims is seen by exactly the same drivers
    // as before.
    const tier = coverageTier(a) - coverageTier(b);
    if (tier !== 0) return tier;
    // Already finishing next door beats a higher score — see `emptyLegTier`.
    const leg = emptyLegTier(a) - emptyLegTier(b);
    if (leg !== 0) return leg;
    // KEKE Certified next — see `certifiedTier`.
    const cert = certifiedTier(a, certified) - certifiedTier(b, certified);
    if (cert !== 0) return cert;
    return compareByRank(scores.get(a.userId), scores.get(b.userId), a.userId, b.userId);
  });

  if (sorted.length <= wave1Size) {
    return { wave1: sorted, wave2: [], scores, certified };
  }

  const wave1 = sorted.slice(0, wave1Size);
  const rest = sorted.slice(wave1Size);

  const alreadyNew = wave1.filter((r) => scores.get(r.userId)?.isNewDriver).length;
  let seats = Math.max(0, Math.min(newDriverSlots, wave1Size) - alreadyNew);

  if (seats > 0) {
    const promoted: T[] = [];
    for (const r of rest) {
      if (seats === 0) break;
      // A newcomer's reserved seat is for building a record, not for being
      // sent somewhere he already said he does not drive.
      if (coverageTier(r) > 0) continue;
      if (scores.get(r.userId)?.isNewDriver) {
        promoted.push(r);
        seats -= 1;
      }
    }
    // Drop the lowest-ranked established drivers to make room — never a
    // certified one: his first-wave place is what the certificate is for.
    const demotable = wave1.filter(
      (r) => !scores.get(r.userId)?.isNewDriver && !certified.has(r.userId),
    );
    const take = Math.min(promoted.length, demotable.length);
    if (take > 0) {
      const promotedNow = promoted.slice(0, take);
      const promotedIds = new Set(promotedNow.map((r) => r.userId));
      const demoted = demotable.slice(-take);
      const demotedIds = new Set(demoted.map((r) => r.userId));

      const finalWave1 = wave1.filter((r) => !demotedIds.has(r.userId)).concat(promotedNow);
      const finalWave2 = demoted.concat(rest.filter((r) => !promotedIds.has(r.userId)));
      return { wave1: finalWave1, wave2: finalWave2, scores, certified };
    }
  }

  return { wave1, wave2: rest, scores, certified };
}

/** Record that these drivers got the first wave, for round-robin fairness. */
export async function markDriversDispatched(driverIds: string[]): Promise<void> {
  const ids = uniqueIds(driverIds);
  if (ids.length === 0) return;
  await supabase.rpc('mark_drivers_dispatched', { p_driver_ids: ids });
}
