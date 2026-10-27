-- ---------------------------------------------------------------------------
-- 6. One-off helpers for moving the documents already uploaded into the
--    private bucket (run together with 20261027100000_security_lockdown).
--
-- The edge function move-documents moves the files from `media` to
-- `documents`. It acts only for a caller holding this secret, which the
-- database makes up here and keeps to itself: the move is started from the
-- database (net.http_post), so the secret never leaves it.
insert into public.app_settings (key, value)
values (
  'documents_move_secret',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Once a file is in the private bucket, the address stored for it changes from
-- the public bucket's to the private one's — only where the file is really
-- there, so it can be run any number of times (move-documents runs it after
-- every batch). Vehicles: an update of an approved vehicle that is switched
-- off and is its driver's only one would switch it on
-- (vehicles_activate_on_approval); such rows are left alone.
create or replace function public.rewrite_moved_document_refs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pub constant text := '/storage/v1/object/public/media/';
  priv constant text := '/storage/v1/object/authenticated/documents/';
  col text;
  n integer;
  report jsonb := '{}'::jsonb;
begin
  foreach col in array array[
    'license_photo', 'id_photo', 'vehicle_registration_photo', 'license_front', 'license_back',
    'tech_passport_front', 'tech_passport_back', 'id_front', 'id_back',
    'license_front_url', 'license_back_url', 'id_document_url', 'business_license_url'
  ] loop
    execute format(
      'update public.users t
          set %1$I = replace(split_part(t.%1$I, ''?'', 1), %2$L, %3$L)
        where strpos(t.%1$I, %2$L) > 0
          and exists (select 1 from storage.objects o
                       where o.bucket_id = ''documents''
                         and o.name = split_part(split_part(t.%1$I, %2$L, 2), ''?'', 1))',
      col, pub, priv);
    get diagnostics n = row_count;
    if n > 0 then
      report := report || jsonb_build_object('users.' || col, n);
    end if;
  end loop;

  foreach col in array array['tech_passport_front', 'tech_passport_back'] loop
    execute format(
      'update public.vehicles t
          set %1$I = replace(split_part(t.%1$I, ''?'', 1), %2$L, %3$L)
        where strpos(t.%1$I, %2$L) > 0
          and exists (select 1 from storage.objects o
                       where o.bucket_id = ''documents''
                         and o.name = split_part(split_part(t.%1$I, %2$L, 2), ''?'', 1))
          and not (t.verification_status = ''approved''
                   and coalesce(t.is_active, false) = false
                   and t.driver_id is not null
                   and not exists (select 1 from public.vehicles v2
                                    where v2.driver_id = t.driver_id
                                      and v2.id <> t.id
                                      and v2.is_active = true))',
      col, pub, priv);
    get diagnostics n = row_count;
    if n > 0 then
      report := report || jsonb_build_object('vehicles.' || col, n);
    end if;
  end loop;

  return report;
end;
$$;

revoke all on function public.rewrite_moved_document_refs() from public, anon, authenticated;
grant execute on function public.rewrite_moved_document_refs() to service_role;
