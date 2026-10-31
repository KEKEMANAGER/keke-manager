-- KEKE P0 release - read-only watch after a step (run ~10 minutes after it).
-- Healthy: no failed cron runs, no push backlog, notifications still flowing.
begin isolation level repeatable read read only;
select 'cron runs, last 15 min' as what,
       (select string_agg(j.jobname || ' ' || d.status || ' x' || d.n, ', ' order by j.jobname, d.status)
          from (select jobid, status, count(*) n from cron.job_run_details
                 where start_time > now() - interval '15 minutes' group by 1, 2) d
          join cron.job j using (jobid)) as detail
union all
select 'failed cron runs, last 15 min',
       coalesce((select string_agg(j.jobname || ': ' || left(d.return_message, 160), ' | ')
                   from cron.job_run_details d join cron.job j using (jobid)
                  where d.start_time > now() - interval '15 minutes' and d.status <> 'succeeded'), 'none')
union all
select 'pushes waiting more than 5 min', (select count(*)::text from public.push_outbox where sent_at is null and send_after < now() - interval '5 minutes')
union all
select 'notifications created, last 15 min', (select count(*)::text from public.notifications where created_at > now() - interval '15 minutes')
union all
select 'bookings by status', (select string_agg(status || ' ' || n, ', ' order by status) from (select status, count(*) n from public.bookings group by 1) s)
union all
select 'booking changes, last 15 min', (select count(*)::text from public.bookings where updated_at > now() - interval '15 minutes');
commit;
