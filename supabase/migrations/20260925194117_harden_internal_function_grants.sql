-- These are internal helpers. Exposed over the REST RPC endpoint they would let
-- any signed-in user push a notification to anybody, or move any booking to any
-- driver. They are only ever called from inside other SECURITY DEFINER
-- functions and triggers, which run as the owner and do not need the grant.
revoke all on function public.booking_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reassign_booking_to_driver(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.refresh_driver_rating(uuid) from public, anon, authenticated;
revoke all on function public.bookings_stamp_lifecycle() from public, anon, authenticated;
revoke all on function public.bookings_after_status_change() from public, anon, authenticated;
revoke all on function public.enforce_company_review_debt() from public, anon, authenticated;
revoke all on function public.ratings_sync_driver_rating() from public, anon, authenticated;
revoke all on function public.run_booking_reminders() from public, anon, authenticated;

-- Signed-in users only, never anonymous visitors.
revoke all on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) from public, anon;
revoke all on function public.confirm_booking_as_driver(uuid) from public, anon;
revoke all on function public.booking_busy_window(uuid) from public, anon;
revoke all on function public.driver_rank_scores(uuid[]) from public, anon;
revoke all on function public.find_replacement_driver_for_booking(uuid, uuid) from public, anon;
revoke all on function public.company_pending_reviews(uuid) from public, anon;
revoke all on function public.company_review_debt(uuid) from public, anon;
revoke all on function public.mark_drivers_dispatched(uuid[]) from public, anon;

grant execute on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.confirm_booking_as_driver(uuid) to authenticated;
grant execute on function public.booking_busy_window(uuid) to authenticated;
grant execute on function public.driver_rank_scores(uuid[]) to authenticated;
grant execute on function public.find_replacement_driver_for_booking(uuid, uuid) to authenticated;
grant execute on function public.company_pending_reviews(uuid) to authenticated;
grant execute on function public.company_review_debt(uuid) to authenticated;
grant execute on function public.mark_drivers_dispatched(uuid[]) to authenticated;
