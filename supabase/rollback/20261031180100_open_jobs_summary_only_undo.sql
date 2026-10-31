-- Undo P0-3 part B: back to part A's read rule — approved drivers read open
-- jobs and offers in full through the table again (what the app versions
-- before the update need). Part A stays.

drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings
  as permissive for select to authenticated
  using (
    (company_id)::text = (auth.uid())::text
    or (
      ((driver_id)::text = (auth.uid())::text or host_driver_id = auth.uid())
      and (status is distinct from 'pending' or (select public.current_driver_can_take_jobs()))
    )
    or (
      (select public.current_driver_can_take_jobs())
      and status = 'pending'
      and coalesce(is_group_master, false) = false
      and (driver_id is null or trim(both from coalesce((driver_id)::text, '')) = '')
      and not exists (
        select 1 from public.booking_driver_declines d
         where d.booking_id = bookings.id
           and d.driver_id = auth.uid()
      )
    )
  );
