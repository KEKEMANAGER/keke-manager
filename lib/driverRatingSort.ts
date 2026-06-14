import { supabase } from './supabase';

export type DriverRatingScore = { average: number; count: number };

export type MatchDriverRatingFields = {
  full_name?: string | null;
  rating?: string | null;
  rating_count?: number;
};

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

export async function fetchDriverRatingScores(
  driverIds: string[],
): Promise<Map<string, DriverRatingScore>> {
  const ids = [...new Set(driverIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('ratings')
    .select('driver_id, overall')
    .in('driver_id', ids);

  if (error || !data?.length) {
    return new Map();
  }

  return computeRatingAveragesFromRows(
    data as { driver_id: string; overall: number }[],
  );
}

export type PushRecipientLike = { userId: string; token: string };

export async function sortPushRecipientsByRating<T extends PushRecipientLike>(
  recipients: T[],
): Promise<T[]> {
  if (recipients.length <= 1) return recipients;

  const ratingMap = await fetchDriverRatingScores(recipients.map((r) => r.userId));

  return [...recipients].sort((a, b) => {
    const ra = ratingMap.get(a.userId) ?? { average: 0, count: 0 };
    const rb = ratingMap.get(b.userId) ?? { average: 0, count: 0 };
    const byRating = compareRatingScores(ra, rb);
    if (byRating !== 0) return byRating;
    return a.userId.localeCompare(b.userId);
  });
}
