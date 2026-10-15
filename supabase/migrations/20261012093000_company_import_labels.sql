-- The importer remembers each company's template.
--
-- Every tour operator labels the same twelve things differently — "Pick-up
-- point", "აყვანის ადგილი", "Место подачи", "Nereden" — and the built-in label
-- table in `supabase/functions/booking-import` can only ever cover the
-- wordings somebody thought to add. When it misses, the model reads the field
-- instead: correct, but slower and paid for by the token.
--
-- The thing is, a transport company receives files from the same handful of
-- operators month after month, in the same layout. So the miss is worth
-- remembering: once the model has told us that this company's files write the
-- pickup as "Nereden", the deterministic parser can read the next one for
-- free, exactly and offline.
--
-- Three rules make this safe to grow unattended:
--   • Built-in labels always win. A learned row can add a wording, never
--     redefine one, so a bad lesson cannot break a document that already
--     parsed.
--   • Rows are per company. Nothing one operator's sheet teaches is applied to
--     anyone else's.
--   • Writes are service-role only, from inside the import function. A company
--     cannot teach its own importer anything by hand, deliberately or not.

create table if not exists public.company_import_labels (
  company_id uuid not null references auth.users (id) on delete cascade,
  /** The operator's wording, already normalised (lower-cased, trimmed). */
  label text not null,
  /** Canonical draft field, or the parser's 'time'/'vehicle' pseudo-fields. */
  field text not null,
  /** How many imports have confirmed this pairing. */
  hits integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (company_id, label)
);

comment on table public.company_import_labels is
  'Per-company booking-import label vocabulary learned from successful imports. Written only by the booking-import function; built-in labels take precedence.';

create index if not exists company_import_labels_company_idx
  on public.company_import_labels (company_id, last_seen_at desc);

alter table public.company_import_labels enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_import_labels'
      and policyname = 'company_import_labels_owner_select'
  ) then
    create policy company_import_labels_owner_select
      on public.company_import_labels
      for select
      using (company_id = auth.uid() or public.is_admin_user());
  end if;
end
$$;

-- No insert/update/delete policy on purpose: with RLS enabled and no policy,
-- only the service role can write, which is the import function and nothing
-- else.

revoke all on table public.company_import_labels from anon;
grant select on table public.company_import_labels to authenticated;
-- RLS without a write policy already blocks these, but the schema's default
-- privileges hand them out, and a table nobody is meant to write by hand
-- should not look writable.
revoke insert, update, delete, truncate, references, trigger
  on table public.company_import_labels from authenticated;
grant select, insert, update, delete on table public.company_import_labels to service_role;

-- Writing a lesson down. Called by the booking-import function with the
-- service role, never by a client.
create or replace function public.remember_import_labels(
  p_company_id uuid,
  p_labels jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
  v_known integer := 0;
begin
  -- Service role only. The import function teaches this table; a company must
  -- not be able to teach its own importer, by hand or by accident.
  if auth.role() is distinct from 'service_role' then
    return 0;
  end if;
  if p_company_id is null or p_labels is null or jsonb_typeof(p_labels) <> 'object' then
    return 0;
  end if;

  -- A vocabulary is a few dozen labels. Past this the company has stopped
  -- learning and started collecting, so new wordings are refused while the
  -- ones already known keep being confirmed.
  select count(*) into v_known
  from public.company_import_labels
  where company_id = p_company_id;

  insert into public.company_import_labels as t (company_id, label, field)
  select p_company_id, lower(btrim(e.key)), btrim(e.value #>> '{}')
  from jsonb_each(p_labels) e
  where jsonb_typeof(e.value) = 'string'
    and length(btrim(e.key)) between 3 and 60
    and length(btrim(e.value #>> '{}')) between 2 and 40
    and (
      v_known < 300
      or exists (
        select 1 from public.company_import_labels k
        where k.company_id = p_company_id and k.label = lower(btrim(e.key))
      )
    )
  on conflict (company_id, label) do update
    set hits = t.hits + 1,
        -- A lesson is provisional for its first couple of sightings, so a
        -- first wrong reading can correct itself. After three confirmations
        -- the pairing is settled and no later file can flip it.
        field = case when t.hits < 3 then excluded.field else t.field end,
        last_seen_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke all on function public.remember_import_labels(uuid, jsonb) from public;
revoke execute on function public.remember_import_labels(uuid, jsonb) from anon;
revoke execute on function public.remember_import_labels(uuid, jsonb) from authenticated;
grant execute on function public.remember_import_labels(uuid, jsonb) to service_role;
