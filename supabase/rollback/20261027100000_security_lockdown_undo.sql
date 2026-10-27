-- Undo of supabase/migrations/20261027100000_security_lockdown.sql.
-- Only for an emergency: it reopens every hole that migration closed.

-- Storage, bucket media
drop policy if exists media_select_own on storage.objects;
drop policy if exists media_insert_own on storage.objects;
drop policy if exists media_update_own on storage.objects;
drop policy if exists media_delete_own on storage.objects;
create policy "allow public uploads" on storage.objects as permissive for all to anon using ((bucket_id = 'media'::text)) with check ((bucket_id = 'media'::text));
create policy "allow anon insert media" on storage.objects as permissive for insert to anon with check ((bucket_id = 'media'::text));
create policy "allow anon select media" on storage.objects as permissive for select to anon using ((bucket_id = 'media'::text));
create policy "Anyone can view media" on storage.objects as permissive for select to public using ((bucket_id = 'media'::text));
create policy "Authenticated users can upload" on storage.objects as permissive for insert to public with check (((bucket_id = 'media'::text) and (auth.uid() is not null)));
create policy "Users can update own files" on storage.objects as permissive for update to public using (((bucket_id = 'media'::text) and (auth.uid() is not null)));
create policy "Users can delete own files" on storage.objects as permissive for delete to public using (((bucket_id = 'media'::text) and (auth.uid() is not null)));
create policy media_select on storage.objects as permissive for select to public using ((bucket_id = 'media'::text));
create policy media_insert_own on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'media'::text) and ((((storage.foldername(name))[1] = any (array['avatars'::text, 'vehicles'::text, 'verifications'::text, 'verification'::text, 'odometer'::text])) and ((storage.foldername(name))[2] = (auth.uid())::text)) or (exists ( select 1 from users u where ((u.id = auth.uid()) and (u.role = 'admin'::text)))))));
create policy media_update_own on storage.objects as permissive for update to authenticated using (((bucket_id = 'media'::text) and ((((storage.foldername(name))[1] = any (array['avatars'::text, 'vehicles'::text, 'verifications'::text, 'verification'::text, 'odometer'::text])) and ((storage.foldername(name))[2] = (auth.uid())::text)) or (exists ( select 1 from users u where ((u.id = auth.uid()) and (u.role = 'admin'::text))))))) with check (((bucket_id = 'media'::text) and ((((storage.foldername(name))[1] = any (array['avatars'::text, 'vehicles'::text, 'verifications'::text, 'verification'::text, 'odometer'::text])) and ((storage.foldername(name))[2] = (auth.uid())::text)) or (exists ( select 1 from users u where ((u.id = auth.uid()) and (u.role = 'admin'::text)))))));
create policy media_delete_own on storage.objects as permissive for delete to authenticated using (((bucket_id = 'media'::text) and ((((storage.foldername(name))[1] = any (array['avatars'::text, 'vehicles'::text, 'verifications'::text, 'verification'::text, 'odometer'::text])) and ((storage.foldername(name))[2] = (auth.uid())::text)) or (exists ( select 1 from users u where ((u.id = auth.uid()) and (u.role = 'admin'::text)))))));
drop function if exists public.media_path_is_mine(text);

-- Tables
create policy "Anyone can read profiles" on public.profiles as permissive for select to public using (true);
create policy "Drivers see pending bookings" on public.bookings as permissive for select to public using (((driver_id is null) and (status = 'pending'::text)));
create policy "Drivers accept pending bookings" on public.bookings as permissive for update to public using (((driver_id is null) and (status = 'pending'::text))) with check ((auth.uid() = driver_id));
create policy "Anyone can see locations" on public.locations as permissive for select to public using (true);
create policy "Companies create ratings" on public.ratings as permissive for insert to public with check ((auth.uid() = company_id));
create policy "Allow Auth Insert Vehicles" on public.vehicles as permissive for insert to authenticated with check (true);
create policy vehicles_authenticated_insert on public.vehicles as permissive for insert to authenticated with check (true);
grant update on public.messages to anon, authenticated;

-- Functions: the three bodies as they were
create or replace function public.company_pending_reviews(p_company_id uuid default null)
returns table(booking_id uuid, driver_id uuid, driver_name text, route text, date_display text, completed_at timestamp with time zone)
language sql stable security definer set search_path to 'public'
as $function$
  select b.id, b.driver_id, coalesce(nullif(trim(b.driver_display_name), ''), u.full_name),
         public.booking_route_summary(b.from_location, b.to_location, b.route::text), b.date_display, b.completed_at
  from public.bookings b
  left join public.users u on u.id = b.driver_id
  where b.company_id = coalesce(p_company_id, auth.uid())
    and b.status = 'completed' and b.driver_id is not null
    and not exists (select 1 from public.ratings ra where ra.booking_id = b.id and ra.company_id = b.company_id)
  order by b.completed_at asc nulls last;
$function$;

create or replace function public.mark_drivers_dispatched(p_driver_ids uuid[])
returns void language sql security definer set search_path to 'public'
as $function$
  update public.users set last_dispatched_at = now()
   where role = 'driver' and id = any (coalesce(p_driver_ids, array[]::uuid[]));
$function$;
-- tour_day_plan: remove the participant check block from the current body
-- (the "if auth.uid() is null or not (...) then return; end if;" lines).

-- Function execute rights as they were
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname in (
       'admin_approve_vehicle_verification','admin_delete_user','admin_reject_vehicle_verification',
       'alert_undispatched_bookings','booking_start_city','company_can_create_bookings',
       'complete_in_progress_booking_as_driver','convoy_chat_open','create_user_notifications',
       'delete_user_account','dispatch_debug','dispatch_due_second_waves','driver_city_key',
       'fetch_convoy_legs_for_participant','filter_drivers_available_for_window','get_fleet_member_profile',
       'get_support_admin_user_id','guard_profiles_privileged_columns','guard_users_privileged_columns',
       'handle_new_user','has_active_booking_with_user','is_admin_user','is_convoy_participant',
       'is_driver_user','list_available_drivers_in_city','list_job_board_hired_drivers','log_dispatch',
       'may_message_convoy_participant','may_message_user','reject_pending_booking_as_driver',
       'sync_driver_profile','sync_profile_on_vehicle_change','sync_push_token_to_profiles',
       'tour_day_count','tour_day_plan','user_may_notify')
  loop
    execute format('grant execute on function %s to anon, authenticated', r.sig);
  end loop;
end $$;
grant execute on function public.dispatch_new_booking_push(uuid, integer) to anon, authenticated;
grant execute on function public.find_replacement_driver_for_booking(uuid, uuid) to authenticated;
