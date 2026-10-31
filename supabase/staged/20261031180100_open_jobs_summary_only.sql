-- P0-3 (part B) · Before a driver has the job, he sees it only as a summary.
--
-- STAGED: not in supabase/migrations on purpose. Apply it only after the app
-- update that reads open jobs through driver_open_jobs() is live (website
-- deployed and the mobile update published), and after part A
-- (20261031180000_driver_eligibility.sql). Then move it into
-- supabase/migrations under a timestamp later than part A's and apply it.
--
-- Part A left one gap so that the app versions installed today keep showing
-- open jobs: an approved driver could still read an open booking — or an
-- offer made to him — in full through the table (and its realtime feed and
-- change log). This part closes it: a driver reads a booking's row only once
-- it is his (status no longer 'pending'). Open jobs and offers reach drivers
-- only through driver_open_jobs(), which leaves out passenger names and
-- phones, meeting contacts, the pickup sign, notes and company-internal
-- prices. booking_history, booking_day_logs, trip_events and the pickup-sign
-- files follow, because their rules look the booking up under this rule.
--
-- Effect on an app that has not updated yet: its list of open jobs is empty
-- (it still reads the table); its own bookings, trips and everything else
-- keep working. Companies and admins: no change.
--
-- Undo: supabase/rollback/20261031180100_open_jobs_summary_only_undo.sql

do $$
begin
  if to_regprocedure('public.driver_open_jobs(uuid)') is null
     or to_regprocedure('public.current_driver_can_take_jobs()') is null then
    raise exception 'P0-3 part B stopped: apply part A (20261031180000_driver_eligibility) first';
  end if;
end
$$;

drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings
  as permissive for select to authenticated
  using (
    (company_id)::text = (auth.uid())::text
    or (
      ((driver_id)::text = (auth.uid())::text or host_driver_id = auth.uid())
      and status is distinct from 'pending'
    )
  );
