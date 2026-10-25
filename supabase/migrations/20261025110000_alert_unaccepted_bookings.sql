-- The admin alert for a booking nobody has taken.
--
-- alert_undispatched_bookings() (run every minute by the "alert-undispatched"
-- cron job) told the admin only about a booking that had reached NO driver
-- five minutes after it was created. A booking that reached drivers but that
-- none of them accepted said nothing at all — and that is the case that
-- actually happens: KEKE-LBG6DX went to all 8 matching drivers on 23 Oct and
-- sat untaken for two days without the admin hearing about it. The alert had
-- never fired once.
--
-- Now any booking still pending with no driver five minutes after it was
-- created alerts the admin once, saying which case it is: sent to nobody, or
-- sent to N drivers and taken by none. (The second dispatch wave goes out at
-- three minutes, so five minutes is after both waves.) Bookings older than a
-- day are left alone so that switching this on does not flood the admin with
-- old ones.

create or replace function public.alert_undispatched_bookings()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       record;
  a       record;
  total   int := 0;
  v_title text;
  v_body  text;
begin
  for r in
    select b.id, b.voucher_code, b.from_location, b.to_location, b.route,
           (select count(distinct n.user_id)
              from public.notifications n
             where n.type = 'new_booking'
               and (n.data ->> 'booking_id') = b.id::text) as reached
      from public.bookings b
     where b.status = 'pending'
       and b.driver_id is null
       and b.dispatch_alert_sent_at is null
       and b.created_at < now() - interval '5 minutes'
       and b.created_at > now() - interval '24 hours'
     order by b.created_at
     limit 10
  loop
    if r.reached = 0 then
      v_title := 'KEKE · ჯავშანი არავის მივიდა!';
      v_body  := coalesce(nullif(trim(r.voucher_code), ''), '') || ' · '
                 || public.booking_route_summary(r.from_location, r.to_location, r.route::text)
                 || ' · არცერთ მძღოლს არ მისულა';
    else
      v_title := 'KEKE · ჯავშანი არავინ აიღო!';
      v_body  := coalesce(nullif(trim(r.voucher_code), ''), '') || ' · '
                 || public.booking_route_summary(r.from_location, r.to_location, r.route::text)
                 || ' · ' || r.reached || ' მძღოლს მიუვიდა, 5 წუთში არავინ აიღო';
    end if;

    for a in select id from public.users where role = 'admin'
    loop
      perform public.booking_notify(
        a.id,
        v_title,
        v_body,
        'dispatch_alert',
        jsonb_build_object('type', 'dispatch_alert', 'booking_id', r.id::text,
                           'reached', r.reached)
      );
    end loop;

    update public.bookings set dispatch_alert_sent_at = now() where id = r.id;
    total := total + 1;
  end loop;

  return total;
end;
$function$;
