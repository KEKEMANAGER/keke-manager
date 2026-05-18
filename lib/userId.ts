/** Normalize Supabase Auth user id (`auth.users.id` / `public.users.id`). */
export function trimUserId(value: string | undefined | null): string {
  return String(value ?? '').trim();
}
