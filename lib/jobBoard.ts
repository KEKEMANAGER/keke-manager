import i18n from '../src/lib/i18n';
import { sendExpoPushNotification } from './expoPush';
import { fetchDriverAverageRating } from './ratings';
import {
  JOB_BOARD_LANG_CODES,
  languageBadgeLabel,
  languageCodesFromList,
  normalizeLanguageCode,
  type JobBoardLangCode,
} from './spokenLanguages';
import { supabase } from './supabase';

export {
  JOB_BOARD_LANG_CODES,
  languageBadgeLabel,
  languageCodesFromList,
  normalizeLanguageCode,
  type JobBoardLangCode,
};

export type HiredDriverStatus = 'looking' | 'employed' | 'not_looking';

export type HiredDriverListing = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  languages: string[];
  languageCodes: JobBoardLangCode[];
  available_for_hire: boolean;
  ratingAverage: number;
  ratingCount: number;
};

function parseLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** Host job board: hired drivers, excluding self and current fleet. */
export async function fetchHiredDriversForBoard(
  hostDriverId: string,
  opts?: { onlyLooking?: boolean },
): Promise<{
  data: HiredDriverListing[];
  error: Error | null;
}> {
  const onlyLooking = opts?.onlyLooking !== false;
  const hostId = hostDriverId.trim();
  if (!hostId) return { data: [], error: null };

  const { data: fleetRows, error: fleetErr } = await supabase
    .from('driver_fleet')
    .select('sub_driver_id, host_driver_id, status')
    .in('status', ['pending', 'accepted']);

  if (fleetErr) return { data: [], error: new Error(fleetErr.message) };

  const excluded = new Set<string>([hostId]);
  for (const row of fleetRows ?? []) {
    const r = row as { sub_driver_id: string; host_driver_id: string; status?: string };
    const st = r.status?.trim() || 'accepted';
    if (st === 'accepted') {
      excluded.add(r.sub_driver_id);
    } else if (st === 'pending' && r.host_driver_id === hostId) {
      excluded.add(r.sub_driver_id);
    }
  }

  let usersQuery = supabase
    .from('users')
    .select('id, full_name, email, avatar_url, bio, languages, available_for_hire')
    .eq('role', 'driver')
    .eq('is_hired_driver', true)
    .eq('is_verified', true);

  if (onlyLooking) {
    usersQuery = usersQuery.eq('available_for_hire', true);
  }

  const { data: users, error: usersErr } = await usersQuery;

  if (usersErr) return { data: [], error: new Error(usersErr.message) };

  type Row = {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    bio: string | null;
    languages: unknown;
    available_for_hire: boolean | null;
  };

  const candidates = (users as Row[] ?? []).filter((u) => !excluded.has(u.id));
  if (candidates.length === 0) return { data: [], error: null };

  const ratings = await Promise.all(
    candidates.map(async (u) => {
      const r = await fetchDriverAverageRating(u.id);
      return {
        id: u.id,
        average: r.average,
        count: r.count,
      };
    }),
  );
  const ratingMap = new Map(ratings.map((r) => [r.id, r]));

  return {
    data: candidates.map((u) => {
      const languages = parseLanguages(u.languages);
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        avatar_url: u.avatar_url,
        languages,
        languageCodes: languageCodesFromList(languages),
        available_for_hire: u.available_for_hire !== false,
        bio: u.bio?.trim() || null,
        ratingAverage: ratingMap.get(u.id)?.average ?? 0,
        ratingCount: ratingMap.get(u.id)?.count ?? 0,
      };
    }),
    error: null,
  };
}

/** @deprecated Use fetchHiredDriversForBoard */
export async function fetchAvailableHiredDrivers(hostDriverId: string): Promise<{
  data: HiredDriverListing[];
  error: Error | null;
}> {
  return fetchHiredDriversForBoard(hostDriverId, { onlyLooking: true });
}

/** Notify hired driver that a host viewed their job-board profile. */
export async function notifyJobBoardProfileViewed(targetDriverId: string): Promise<{
  error: Error | null;
}> {
  const id = targetDriverId.trim();
  if (!id) return { error: new Error('driver id missing') };

  const title = i18n.t('jobBoard.profileViewedTitle');
  const body = i18n.t('jobBoard.profileViewedBody');

  const { error: insertErr } = await supabase.from('notifications').insert({
    user_id: id,
    type: 'profile_viewed',
    title,
    body,
    data: { type: 'profile_viewed' },
  });

  if (insertErr) {
    return { error: new Error(insertErr.message) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', id)
    .maybeSingle();

  const token = (profile as { push_token?: string | null } | null)?.push_token?.trim() ?? '';
  if (token) {
    await sendExpoPushNotification(token, title, body, { type: 'profile_viewed' });
  }

  return { error: null };
}

/** Hired driver work status for profile UI. */
export async function fetchHiredDriverStatus(driverId: string): Promise<{
  status: HiredDriverStatus;
  hostName: string | null;
  error: Error | null;
}> {
  const id = driverId.trim();
  if (!id) return { status: 'looking', hostName: null, error: null };

  const { data: fleetRow, error: fleetErr } = await supabase
    .from('driver_fleet')
    .select('host_driver_id, status')
    .eq('sub_driver_id', id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (fleetErr) return { status: 'looking', hostName: null, error: new Error(fleetErr.message) };

  if (fleetRow) {
    const hostId = (fleetRow as { host_driver_id: string }).host_driver_id;
    const { data: host } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', hostId)
      .maybeSingle();
    return {
      status: 'employed',
      hostName: (host as { full_name?: string | null } | null)?.full_name?.trim() || null,
      error: null,
    };
  }

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('available_for_hire')
    .eq('id', id)
    .maybeSingle();

  if (userErr) return { status: 'looking', hostName: null, error: new Error(userErr.message) };

  const available = (user as { available_for_hire?: boolean | null } | null)?.available_for_hire !== false;
  return {
    status: available ? 'looking' : 'not_looking',
    hostName: null,
    error: null,
  };
}

export async function updateHiredDriverJobBoardProfile(
  userId: string,
  patch: { bio?: string | null; available_for_hire?: boolean },
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  return { error: error ? new Error(error.message) : null };
}
