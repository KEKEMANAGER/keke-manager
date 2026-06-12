/** Normalize Supabase Auth user id (`auth.users.id` / `public.users.id`). */
export function trimUserId(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

export function userIdsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = trimUserId(a).toLowerCase();
  const right = trimUserId(b).toLowerCase();
  return Boolean(left && right && left === right);
}
