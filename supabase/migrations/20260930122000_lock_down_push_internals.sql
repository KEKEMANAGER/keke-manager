-- Postgres grants EXECUTE to PUBLIC on every new function, and PostgREST
-- exposes anything in `public` as /rest/v1/rpc/<name>. That meant
-- `send_expo_push` — which posts to Expo with whatever token, title and body it
-- is handed — was callable by anyone holding the anon key, which ships inside
-- the web bundle. Same for `fetch_user_push_token`, which hands back another
-- user's push token.
--
-- These are internal plumbing: every real caller is a SECURITY DEFINER function
-- or a trigger, and both run as the owner, so REVOKE ... FROM PUBLIC does not
-- touch them. Verified first that no client code calls any of these over RPC.

revoke execute on function public.send_expo_push(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fetch_user_push_token(uuid) from public, anon, authenticated;
revoke execute on function public.booking_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.flush_push_outbox(int) from public, anon, authenticated;
revoke execute on function public.dispatch_new_booking_push(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_missed_new_bookings() from public, anon, authenticated;
revoke execute on function public.vehicles_activate_on_approval() from public, anon, authenticated;

-- `enqueue_booking_push` IS called by the app (dispatch wave 2). It checks
-- auth.uid() against the booking's company/driver itself, so signed-in only.
revoke execute on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, int) from public, anon;
grant execute on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, int) to authenticated;
