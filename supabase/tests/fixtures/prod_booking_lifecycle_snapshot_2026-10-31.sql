-- Read-only snapshot of the PRODUCTION objects involved in the booking
-- lifecycle (accept / decline), captured on 2026-10-31 from the live catalog of
-- project brrjuxgxmpgvkddcuaad with SELECT queries only. Schema only: no rows,
-- no secrets (app_settings values are data and are not here).
--
-- Purpose: a faithful local stand-in for production so the P0-1 tests can run
-- without touching production. It is a TEST FIXTURE, not a migration and not
-- the production baseline (see the Phase 1 report for the baseline plan).
--
-- Scope: tables users, profiles, vehicles, bookings, driver_schedules,
-- driver_fleet, notifications, booking_emails, ratings, app_settings,
-- web_push_subscriptions with their constraints, indexes, RLS policies and
-- grants; the 20 functions those rules and the accept/decline path call; the
-- triggers on bookings and driver_schedules. Left out: triggers on the other
-- tables, FKs to vehicle_makes / vehicle_models, everything unrelated.
--
-- Load after supabase_shim.sql. Function bodies are loaded with
-- check_function_bodies = off because they reference each other.
set check_function_bodies = off;

-- ===================================================== TABLES

create table public.app_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now() not null
);

create table public.booking_emails (
  id bigint generated always as identity not null,
  booking_id uuid not null,
  event text not null,
  driver_id uuid,
  status text default 'queued'::text not null,
  recipient text,
  attempts integer default 0 not null,
  last_error text,
  provider_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  dedupe_key text not null,
  details jsonb default '{}'::jsonb not null,
  send_after timestamp with time zone default now() not null
);

create table public.bookings (
  id uuid default gen_random_uuid() not null,
  company_id uuid,
  driver_id uuid,
  kind text not null,
  status text default 'pending'::text,
  from_location text,
  to_location text,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  passengers integer,
  luggage integer,
  vehicle_class text,
  flight_number text,
  meet_name text,
  meet_phone text,
  has_banner boolean default false,
  overnight boolean default false,
  route jsonb,
  price_net numeric,
  price_gross numeric,
  payment_method text,
  payment_status text default 'unpaid'::text,
  comment text,
  voucher_code text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  booking_type text,
  date_display text,
  price_gel numeric,
  company_name text,
  driver_display_name text,
  driver_phone text,
  driver_plate text,
  meet_greet boolean default false,
  sign_text text,
  passenger_name text,
  passenger_phone text,
  flight_direction text,
  pickup_time text,
  client_price numeric,
  commission numeric,
  tour_days jsonb,
  transfer_in jsonb,
  transfer_out jsonb,
  itinerary jsonb default '[]'::jsonb,
  created_by_name text,
  vehicle_type text,
  required_languages text[] default '{}'::text[],
  host_driver_id uuid,
  requested_driver_category text default 'all'::text,
  pickup_sign_logo_url text,
  driver_update_pending boolean default false,
  vehicle_id uuid,
  from_location_type text,
  to_location_type text,
  payment_confirmed_at timestamp with time zone,
  payment_confirmed_by uuid,
  reminder_24h_sent boolean default false,
  reminder_1h_sent boolean default false,
  driver_confirmed_1h boolean,
  reminder_1h_sent_at timestamp with time zone,
  company_unconfirmed_alert_sent boolean default false,
  odometer_start_photo_url text,
  odometer_start_at timestamp with time zone,
  odometer_end_photo_url text,
  odometer_end_at timestamp with time zone,
  driver_payout_gel numeric,
  parent_booking_id uuid,
  leg_index integer,
  is_group_master boolean default false not null,
  group_code text,
  is_emergency_replacement boolean default false not null,
  breakdown_location text,
  breakdown_location_type text,
  price_includes_fuel boolean,
  driver_overnight_by text,
  requested_capacity_tier text,
  requested_vehicle_model_group text,
  cancelled_by text,
  cancelled_at timestamp with time zone,
  reminder_3h_sent boolean default false,
  reminder_3h_sent_at timestamp with time zone,
  reminder_45m_sent boolean default false,
  reminder_45m_sent_at timestamp with time zone,
  driver_confirmed_at timestamp with time zone,
  reassign_count integer default 0 not null,
  completed_at timestamp with time zone,
  dispatch_fallback_sent_at timestamp with time zone,
  hotel text,
  dispatch_wave2_due_at timestamp with time zone,
  dispatch_alert_sent_at timestamp with time zone,
  from_location_link text,
  to_location_link text
);

create table public.driver_fleet (
  id uuid default gen_random_uuid() not null,
  host_driver_id uuid not null,
  sub_driver_id uuid not null,
  vehicle_id uuid not null,
  created_at timestamp with time zone default now() not null,
  status text default 'accepted'::text not null
);

create table public.driver_schedules (
  id uuid default gen_random_uuid() not null,
  driver_id uuid not null,
  booking_id uuid,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  source text not null,
  created_at timestamp with time zone default now(),
  vehicle_id uuid
);

create table public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  title text,
  body text,
  type text,
  is_read boolean default false,
  data jsonb,
  created_at timestamp with time zone default now()
);

create table public.profiles (
  id uuid not null,
  email text,
  full_name text,
  vehicle_type text,
  vehicle_class text,
  push_token text,
  created_at timestamp with time zone default now(),
  is_verified boolean default false,
  languages text[] default '{}'::text[],
  avatar_url text,
  birth_date date
);

create table public.ratings (
  id uuid default gen_random_uuid() not null,
  booking_id uuid,
  driver_id uuid,
  company_id uuid,
  punctuality integer,
  cleanliness integer,
  communication integer,
  driving_quality integer,
  overall numeric,
  comment text,
  created_at timestamp with time zone default now()
);

create table public.users (
  id uuid default gen_random_uuid() not null,
  role text,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  bio text,
  languages text[],
  balance numeric default 0,
  rating numeric default 0,
  is_verified boolean default false,
  subscription_type text,
  subscription_expires_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  experience_years integer,
  verification_status text default 'pending'::text,
  license_photo text,
  id_photo text,
  vehicle_registration_photo text,
  rejection_reason text,
  push_token text,
  tax_id text,
  is_hired_driver boolean default false not null,
  available_for_hire boolean default true not null,
  license_front text,
  license_back text,
  tech_passport_front text,
  tech_passport_back text,
  id_front text,
  id_back text,
  is_blocked boolean default false not null,
  company_email text,
  company_id_code text,
  company_phone text,
  company_director text,
  city text,
  is_guide_driver boolean default false,
  first_name text,
  last_name text,
  date_of_birth date,
  license_number text,
  license_expiry date,
  license_front_url text,
  license_back_url text,
  id_document_url text,
  tourism_experience integer,
  spoken_languages jsonb,
  last_seen_at timestamp with time zone,
  company_name text,
  company_address text,
  business_license_url text,
  bank_account text,
  current_city text,
  is_available boolean default false,
  available_updated_at timestamp with time zone,
  rating_count integer default 0 not null,
  last_dispatched_at timestamp with time zone,
  service_regions text[],
  travels_countrywide boolean,
  keke_certified_at timestamp with time zone
);

create table public.vehicles (
  id uuid default gen_random_uuid() not null,
  type text not null,
  class text,
  model text,
  color text,
  year integer,
  plate text,
  photo_front text,
  photo_left text,
  photo_right text,
  photo_interior text,
  photo_rear text,
  is_verified boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  driver_id uuid,
  is_active boolean default false not null,
  make_id integer,
  model_id integer,
  passenger_capacity integer,
  tech_passport_front text,
  tech_passport_back text,
  verification_status text default 'pending'::text not null,
  rejection_reason text,
  photo_meta jsonb default '{}'::jsonb not null,
  capacity_tier text
);

create table public.web_push_subscriptions (
  id bigint default nextval('web_push_subscriptions_id_seq'::regclass) not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_ok_at timestamp with time zone,
  fail_count integer default 0 not null
);

-- ===================================================== CONSTRAINTS

alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table public.booking_emails add constraint booking_emails_pkey PRIMARY KEY (id);
alter table public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table public.driver_fleet add constraint driver_fleet_pkey PRIMARY KEY (id);
alter table public.driver_schedules add constraint driver_schedules_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.ratings add constraint ratings_pkey PRIMARY KEY (id);
alter table public.users add constraint users_pkey PRIMARY KEY (id);
alter table public.vehicles add constraint vehicles_pkey PRIMARY KEY (id);
alter table public.web_push_subscriptions add constraint web_push_subscriptions_pkey PRIMARY KEY (id);
alter table public.driver_fleet add constraint driver_fleet_sub_unique UNIQUE (sub_driver_id);
alter table public.driver_fleet add constraint driver_fleet_vehicle_unique UNIQUE (vehicle_id);
alter table public.users add constraint users_email_key UNIQUE (email);
alter table public.web_push_subscriptions add constraint web_push_subscriptions_endpoint_key UNIQUE (endpoint);
alter table public.booking_emails add constraint booking_emails_event_check CHECK ((event = ANY (ARRAY['created'::text, 'edited'::text, 'confirmed'::text, 'driver_changed'::text, 'rejected'::text, 'cancelled'::text, 'started'::text, 'pickup'::text, 'dropoff'::text, 'completed'::text, 'voucher'::text])));
alter table public.booking_emails add constraint booking_emails_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
alter table public.bookings add constraint bookings_cancelled_by_check CHECK (((cancelled_by IS NULL) OR (cancelled_by = ANY (ARRAY['driver'::text, 'company'::text, 'admin'::text, 'system'::text]))));
alter table public.bookings add constraint bookings_driver_overnight_by_check CHECK (((driver_overnight_by IS NULL) OR (driver_overnight_by = ANY (ARRAY['keke'::text, 'company'::text]))));
alter table public.bookings add constraint bookings_from_location_link_check CHECK (((from_location_link IS NULL) OR ((char_length(from_location_link) <= 2048) AND (from_location_link ~* '^https://'::text))));
alter table public.bookings add constraint bookings_from_location_type_check CHECK (((from_location_type IS NULL) OR (from_location_type = ANY (ARRAY['airport'::text, 'train_station'::text, 'hotel'::text, 'address'::text]))));
alter table public.bookings add constraint bookings_kind_check CHECK ((kind = ANY (ARRAY['transfer'::text, 'tour'::text, 'one_day_tour'::text])));
alter table public.bookings add constraint bookings_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text])));
alter table public.bookings add constraint bookings_requested_driver_category_check CHECK ((requested_driver_category = ANY (ARRAY['all'::text, 'guide'::text, 'own_vehicle'::text])));
alter table public.bookings add constraint bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'rejected'::text])));
alter table public.bookings add constraint bookings_to_location_link_check CHECK (((to_location_link IS NULL) OR ((char_length(to_location_link) <= 2048) AND (to_location_link ~* '^https://'::text))));
alter table public.bookings add constraint bookings_to_location_type_check CHECK (((to_location_type IS NULL) OR (to_location_type = ANY (ARRAY['airport'::text, 'train_station'::text, 'hotel'::text, 'address'::text]))));
alter table public.driver_fleet add constraint driver_fleet_not_self CHECK ((host_driver_id <> sub_driver_id));
alter table public.driver_fleet add constraint driver_fleet_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])));
alter table public.driver_schedules add constraint driver_schedules_source_check CHECK ((source = ANY (ARRAY['booking'::text, 'manual'::text])));
alter table public.driver_schedules add constraint driver_schedules_time_order_check CHECK ((end_time >= start_time));
alter table public.ratings add constraint ratings_cleanliness_check CHECK (((cleanliness >= 1) AND (cleanliness <= 5)));
alter table public.ratings add constraint ratings_communication_check CHECK (((communication >= 1) AND (communication <= 5)));
alter table public.ratings add constraint ratings_driving_quality_check CHECK (((driving_quality >= 1) AND (driving_quality <= 5)));
alter table public.ratings add constraint ratings_punctuality_check CHECK (((punctuality >= 1) AND (punctuality <= 5)));
alter table public.users add constraint users_role_check CHECK ((role = ANY (ARRAY['driver'::text, 'company'::text, 'admin'::text])));
alter table public.vehicles add constraint vehicles_class_check CHECK ((class = ANY (ARRAY['economy'::text, 'comfort'::text, 'business'::text, 'premium'::text, 'vip'::text, 'ეკონომი'::text, 'კომფორტი'::text, 'ბიზნეს'::text, 'პრემიუმ'::text, 'VIP'::text])));
alter table public.vehicles add constraint vehicles_type_check CHECK ((type = ANY (ARRAY['sedan'::text, 'minivan'::text, 'suv'::text, 'microbus'::text, 'bus'::text, 'special'::text, 'სედანი'::text, 'მინივენი'::text, 'მიკროავტობუსი'::text, 'ავტობუსი'::text, 'სპეც. ტრანსპორტი'::text])));
alter table public.vehicles add constraint vehicles_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])));
alter table public.driver_schedules add constraint driver_schedules_no_driver_overlap EXCLUDE USING gist (driver_id WITH =, tstzrange(start_time, end_time, '[)'::text) WITH &&);
alter table public.driver_schedules add constraint driver_schedules_no_vehicle_overlap EXCLUDE USING gist (vehicle_id WITH =, tstzrange(start_time, end_time, '[)'::text) WITH &&) WHERE ((vehicle_id IS NOT NULL));
alter table public.booking_emails add constraint booking_emails_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_company_id_fkey FOREIGN KEY (company_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.bookings add constraint bookings_host_driver_id_fkey FOREIGN KEY (host_driver_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.bookings add constraint bookings_parent_booking_id_fkey FOREIGN KEY (parent_booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;
alter table public.driver_fleet add constraint driver_fleet_host_driver_id_fkey FOREIGN KEY (host_driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.driver_fleet add constraint driver_fleet_sub_driver_id_fkey FOREIGN KEY (sub_driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.driver_fleet add constraint driver_fleet_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
alter table public.driver_schedules add constraint driver_schedules_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.driver_schedules add constraint driver_schedules_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ratings add constraint ratings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.ratings add constraint ratings_company_id_fkey FOREIGN KEY (company_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ratings add constraint ratings_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.vehicles add constraint vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.web_push_subscriptions add constraint web_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===================================================== INDEXES

CREATE UNIQUE INDEX booking_emails_dedupe ON public.booking_emails USING btree (booking_id, dedupe_key);
CREATE INDEX booking_emails_open ON public.booking_emails USING btree (created_at) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text, 'failed'::text]));
CREATE INDEX bookings_dispatch_wave2_due_at_idx ON public.bookings USING btree (dispatch_wave2_due_at) WHERE (dispatch_wave2_due_at IS NOT NULL);
CREATE INDEX bookings_group_master_idx ON public.bookings USING btree (is_group_master) WHERE (is_group_master = true);
CREATE INDEX bookings_host_driver_id_idx ON public.bookings USING btree (host_driver_id);
CREATE INDEX bookings_parent_booking_id_idx ON public.bookings USING btree (parent_booking_id) WHERE (parent_booking_id IS NOT NULL);
CREATE INDEX bookings_reminder_scan_idx ON public.bookings USING btree (status) WHERE ((driver_id IS NOT NULL) AND (status = ANY (ARRAY['accepted'::text, 'in_progress'::text])));
CREATE INDEX bookings_vehicle_id_idx ON public.bookings USING btree (vehicle_id);
CREATE INDEX idx_bookings_driver_update_pending ON public.bookings USING btree (driver_update_pending) WHERE (driver_update_pending = true);
CREATE INDEX driver_fleet_host_idx ON public.driver_fleet USING btree (host_driver_id);
CREATE INDEX driver_fleet_status_idx ON public.driver_fleet USING btree (status);
CREATE INDEX driver_fleet_sub_idx ON public.driver_fleet USING btree (sub_driver_id);
CREATE INDEX driver_schedules_booking_idx ON public.driver_schedules USING btree (booking_id) WHERE (booking_id IS NOT NULL);
CREATE UNIQUE INDEX driver_schedules_booking_unique ON public.driver_schedules USING btree (booking_id) WHERE ((booking_id IS NOT NULL) AND (source = 'booking'::text));
CREATE INDEX driver_schedules_driver_time_idx ON public.driver_schedules USING btree (driver_id, start_time, end_time);
CREATE INDEX driver_schedules_vehicle_time_idx ON public.driver_schedules USING btree (vehicle_id, start_time, end_time) WHERE (vehicle_id IS NOT NULL);
CREATE UNIQUE INDEX ratings_company_booking_unique ON public.ratings USING btree (company_id, booking_id);
CREATE INDEX users_service_regions_idx ON public.users USING gin (service_regions);
CREATE INDEX idx_vehicles_capacity_tier ON public.vehicles USING btree (capacity_tier) WHERE (capacity_tier IS NOT NULL);
CREATE INDEX web_push_subscriptions_user_idx ON public.web_push_subscriptions USING btree (user_id);

-- ===================================================== FUNCTIONS

CREATE OR REPLACE FUNCTION public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_display_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_plate text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  w record;
  v_vehicle uuid;
  caller uuid := auth.uid();
  allowed boolean := false;
  c_booking uuid;
  c_start timestamptz;
  c_end timestamptz;
  which_busy text;
begin
  if p_booking_id is null or p_driver_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_input',
      'message', 'ჯავშნის ან მძღოლის id არ არის');
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  if caller is not null then
    if caller = p_driver_id then
      allowed := true;
    elsif caller = b.company_id then
      allowed := true;
    elsif public.is_admin_user() then
      allowed := true;
    elsif exists (
      select 1 from public.driver_fleet f
       where f.host_driver_id = caller
         and f.sub_driver_id = p_driver_id
         and f.status = 'accepted'
    ) then
      allowed := true;
    end if;
  end if;

  if not allowed then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ამ ჯავშნის აღების უფლება არ გაქვს');
  end if;

  if b.status is distinct from 'pending' then
    if b.driver_id = p_driver_id and b.status in ('accepted', 'in_progress') then
      return jsonb_build_object('ok', true, 'code', 'already_yours',
        'message', 'ჯავშანი უკვე შენზეა');
    end if;
    return jsonb_build_object('ok', false, 'code', 'not_pending',
      'message', 'ჯავშანი უკვე აღებულია ან მიუწვდომელია');
  end if;

  if b.driver_id is not null and b.driver_id <> p_driver_id then
    return jsonb_build_object('ok', false, 'code', 'taken',
      'message', 'ჯავშანი სხვა მძღოლზეა მიბმული');
  end if;

  v_vehicle := coalesce(p_vehicle_id, b.vehicle_id);

  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return jsonb_build_object('ok', false, 'code', 'no_window',
      'message', 'ჯავშნის თარიღი ვერ წაიკითხა');
  end if;

  begin
    insert into public.driver_schedules
      (driver_id, vehicle_id, booking_id, start_time, end_time, source)
    values
      (p_driver_id, v_vehicle, p_booking_id, w.win_start, w.win_end, 'booking');
  exception
    when unique_violation then
      update public.driver_schedules
         set driver_id  = p_driver_id,
             vehicle_id = v_vehicle,
             start_time = w.win_start,
             end_time   = w.win_end
       where booking_id = p_booking_id
         and source = 'booking';
    when exclusion_violation then
      select ds.booking_id,
             ds.start_time,
             ds.end_time,
             case when ds.driver_id = p_driver_id then 'driver' else 'vehicle' end
        into c_booking, c_start, c_end, which_busy
        from public.driver_schedules ds
       where tstzrange(ds.start_time, ds.end_time, '[)')
             && tstzrange(w.win_start, w.win_end, '[)')
         and (ds.driver_id = p_driver_id
              or (v_vehicle is not null and ds.vehicle_id = v_vehicle))
       order by (ds.driver_id = p_driver_id) desc, ds.start_time
       limit 1;

      which_busy := coalesce(which_busy, 'driver');

      return jsonb_build_object(
        'ok', false,
        'code', case when which_busy = 'vehicle' then 'vehicle_busy' else 'driver_busy' end,
        'message', case when which_busy = 'vehicle'
                        then 'ეს მანქანა ამ თარიღებზე უკვე სხვა ჯავშანშია'
                        else 'ამ თარიღებზე უკვე გაქვს სხვა ჯავშანი' end,
        'conflictBookingId', c_booking,
        'conflictStart', c_start,
        'conflictEnd', c_end,
        'windowStart', w.win_start,
        'windowEnd', w.win_end
      );
  end;

  update public.bookings
     set driver_id = p_driver_id,
         status = 'accepted',
         driver_display_name = coalesce(nullif(trim(p_display_name), ''), driver_display_name),
         driver_phone        = coalesce(nullif(trim(p_phone), ''), driver_phone),
         driver_plate        = coalesce(nullif(trim(p_plate), ''), driver_plate),
         vehicle_id          = v_vehicle,
         updated_at          = now()
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'code', 'accepted',
    'windowStart', w.win_start, 'windowEnd', w.win_end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_busy_window(p_booking_id uuid)
 RETURNS TABLE(win_start timestamp with time zone, win_end timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  k text;
  primary_ts timestamptz;
  tin timestamptz;
  tout timestamptz;
  s timestamptz;
  e timestamptz;
  last_day date;
  n_itin int;
  min_len interval;
begin
  select kind, booking_type, date_display, tour_days, itinerary, transfer_in, transfer_out
    into b
    from public.bookings
   where id = p_booking_id;
  if not found then
    return;
  end if;

  k := lower(trim(coalesce(b.kind, b.booking_type, 'transfer')));
  if k in ('day_tour', 'daytour', 'day tour', 'one_day_tour') then
    k := 'day_tour';
  elsif k = 'tour' then
    k := 'tour';
  else
    k := 'transfer';
  end if;

  min_len := case when k = 'transfer' then interval '2 hours' else interval '8 hours' end;

  primary_ts := public.parse_booking_start_ts(b.date_display);
  tin  := public.parse_booking_start_ts(b.transfer_in  ->> 'date');
  tout := public.parse_booking_start_ts(b.transfer_out ->> 'date');

  if k = 'transfer' then
    s := coalesce(primary_ts, now());
    e := s + interval '2 hours';
  elsif k = 'day_tour' then
    s := coalesce(primary_ts, now());
    e := s + interval '8 hours';
  else
    s := coalesce(tin, primary_ts, now());
    e := s + interval '8 hours';

    if tout is not null and tout > s then
      e := tout + interval '8 hours';
    elsif jsonb_array_length(coalesce(b.tour_days, '[]'::jsonb)) > 0 then
      begin
        last_day := ((b.tour_days -> (jsonb_array_length(b.tour_days) - 1)) ->> 'date')::date;
      exception when others then
        last_day := null;
      end;
      if last_day is not null then
        -- tour day ends in the evening, not at 08:00
        e := (last_day::timestamp at time zone 'Asia/Tbilisi') + interval '20 hours';
      end if;
    elsif jsonb_array_length(coalesce(b.itinerary, '[]'::jsonb)) > 0 then
      n_itin := greatest(1, jsonb_array_length(b.itinerary));
      e := s + (n_itin * interval '8 hours');
    elsif primary_ts is not null and primary_ts > s then
      e := primary_ts + interval '8 hours';
    end if;
  end if;

  -- never shorter than the minimum realistic duration for this kind
  if e < s + min_len then
    e := s + min_len;
  end if;

  win_start := s;
  win_end := e;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_notify(p_user_id uuid, p_title text, p_body text, p_type text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tok text;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, title, body, type, is_read, data)
  values (p_user_id, p_title, p_body, p_type, false, coalesce(p_data, '{}'::jsonb));

  tok := public.fetch_user_push_token(p_user_id);
  if tok is not null then
    perform public.send_expo_push(tok, p_title, p_body, coalesce(p_data, '{}'::jsonb));
  end if;

  perform public.send_web_push(p_user_id, p_title, p_body,
    coalesce(p_data, '{}'::jsonb) || jsonb_build_object('type', p_type));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_route_summary(p_from text, p_to text, p_route text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN nullif(trim(p_from), '') IS NOT NULL AND nullif(trim(p_to), '') IS NOT NULL
      THEN trim(p_from) || ' → ' || trim(p_to)
    ELSE COALESCE(nullif(trim(p_route), ''), '—')
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.bookings_after_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  route text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status in ('cancelled', 'rejected') then
    delete from public.driver_schedules
     where booking_id = new.id and source = 'booking';
    return null;
  end if;

  if new.status = 'completed' then
    -- shorten, never invert: an empty range is the correct "released" shape
    update public.driver_schedules
       set end_time = greatest(now(), start_time)
     where booking_id = new.id
       and source = 'booking'
       and end_time > now();

    if new.company_id is not null and new.driver_id is not null then
      route := public.booking_route_summary(new.from_location, new.to_location, new.route::text);
      perform public.booking_notify(
        new.company_id,
        'KEKE Manager',
        'დასრულდა: ' || route || '. გთხოვ შეაფასო მძღოლი — შეფასების გარეშე ახალი ჯავშნის შექმნა შეიზღუდება',
        'booking_review_required',
        jsonb_build_object('type', 'booking_review_required',
                           'bookingId', new.id::text,
                           'driverId', new.driver_id::text));
    end if;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bookings_queue_company_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    -- a group's cars are announced once, by the group's own row
    if new.parent_booking_id is null then
      perform public.queue_booking_email(new.id, 'created', new.driver_id, 'created');
    end if;
    return null;
  end if;

  -- another driver took over a booking that already had one
  if new.driver_id is not null and old.driver_id is not null
     and new.driver_id is distinct from old.driver_id
     and old.status in ('accepted', 'in_progress')
     and new.status in ('accepted', 'in_progress') then
    perform public.queue_booking_email(new.id, 'driver_changed', new.driver_id,
      'driver_changed:' || new.driver_id::text,
      jsonb_build_object('old_driver_id', old.driver_id));
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'accepted' and new.driver_id is not null
     and not coalesce(new.is_group_master, false) then
    perform public.queue_booking_email(new.id, 'confirmed', new.driver_id, 'confirmed:' || new.driver_id::text);
  elsif new.status = 'in_progress' and new.driver_id is not null then
    perform public.queue_booking_email(new.id, 'started', new.driver_id, 'started:' || new.driver_id::text);
  elsif new.status = 'completed' and new.driver_id is not null then
    perform public.queue_booking_email(new.id, 'completed', new.driver_id, 'completed:' || new.driver_id::text);
  elsif new.status = 'cancelled' then
    -- a car of a group waits a minute: when the whole group is being cancelled
    -- the group's own email covers it and the sender skips the car's
    perform public.queue_booking_email(new.id, 'cancelled', coalesce(new.driver_id, old.driver_id), 'cancelled',
      jsonb_build_object('cancelled_by', new.cancelled_by, 'old_driver_id', old.driver_id, 'old_status', old.status),
      case when new.parent_booking_id is not null then interval '1 minute' else interval '0' end);
  elsif new.status = 'rejected' then
    perform public.queue_booking_email(new.id, 'rejected', old.driver_id, 'rejected',
      jsonb_build_object('old_driver_id', old.driver_id));
  end if;
  return null;
exception when others then
  raise warning 'booking email not queued for %: %', new.id, sqlerrm;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bookings_stamp_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller uuid := auth.uid();
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    if new.cancelled_by is null then
      if caller is not null and caller = old.driver_id then
        new.cancelled_by := 'driver';
      elsif caller is not null and caller = old.company_id then
        new.cancelled_by := 'company';
      elsif caller is null then
        new.cancelled_by := 'system';
      else
        new.cancelled_by := 'admin';
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.company_can_create_bookings()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_blocked, false) = false
      and (
        u.role = 'admin'
        or (
          u.role = 'company'
          and (
            lower(btrim(coalesce(u.verification_status, ''))) = 'approved'
            or u.is_verified = true
            or exists (
              select 1 from public.profiles pr
              where pr.id = u.id and pr.is_verified = true
            )
          )
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_company_review_debt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  debt integer;
  lim integer := public.review_debt_limit();
begin
  if new.company_id is null then
    return new;
  end if;

  -- legs of a group booking and emergency replacements must never be blocked
  if new.parent_booking_id is not null
     or coalesce(new.is_emergency_replacement, false) then
    return new;
  end if;

  if public.is_admin_user() then
    return new;
  end if;

  select count(*) into debt
    from public.bookings b
   where b.company_id = new.company_id
     and b.status = 'completed'
     and b.driver_id is not null
     and not exists (
       select 1 from public.ratings ra
        where ra.booking_id = b.id
          and ra.company_id = b.company_id
     );

  if debt >= lim then
    raise exception
      'REVIEW_DEBT: % შეუფასებელი დასრულებული ჯავშანი გაქვს. გთხოვ შეაფასო მძღოლები, სანამ ახალ ჯავშანს შექმნი.', debt
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fetch_user_push_token(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(trim(p.push_token), ''),
    NULLIF(trim(u.push_token), '')
  )
  FROM (SELECT p_user_id AS id) x
  LEFT JOIN public.profiles p ON p.id = x.id
  LEFT JOIN public.users u ON u.id = x.id;
$function$
;

CREATE OR REPLACE FUNCTION public.has_active_booking_with_user(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status IN ('accepted', 'confirmed', 'in_progress')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id = auth.uid() AND b.driver_id = target_user_id)
        OR (b.driver_id = auth.uid() AND b.company_id = target_user_id)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_driver_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'driver'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.parse_booking_start_ts(p_date_display text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  raw text := trim(COALESCE(p_date_display, ''));
  ts timestamptz;
BEGIN
  IF raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    ts := raw::timestamptz;
    RETURN ts;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_booking_email(p_booking_id uuid, p_event text, p_driver_id uuid, p_dedupe text, p_details jsonb DEFAULT '{}'::jsonb, p_delay interval DEFAULT '00:00:00'::interval)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_scope   text;
  v_email   text;
begin
  select company_id into v_company from public.bookings where id = p_booking_id;
  if v_company is null then
    return;
  end if;

  select lower(replace(coalesce(value, 'all'), ' ', '')) into v_scope
    from public.app_settings where key = 'booking_email_scope';
  if coalesce(v_scope, 'all') <> 'all' then
    select lower(trim(coalesce(nullif(trim(u.company_email), ''), u.email))) into v_email
      from public.users u where u.id = v_company;
    if v_email is null or not (v_email = any (string_to_array(v_scope, ','))) then
      return;
    end if;
  end if;

  insert into public.booking_emails (booking_id, event, driver_id, dedupe_key, details, send_after)
  values (p_booking_id, p_event, p_driver_id, p_dedupe, coalesce(p_details, '{}'::jsonb),
          now() + coalesce(p_delay, interval '0'))
  on conflict do nothing;

  if found and coalesce(p_delay, interval '0') <= interval '0' then
    perform public.wake_booking_emails();
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_pending_booking_as_driver(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_driver_user() THEN
    RAISE EXCEPTION 'driver only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings b
  SET
    status = 'rejected',
    driver_id = NULL,
    driver_display_name = NULL,
    driver_phone = NULL,
    driver_plate = NULL,
    updated_at = now()
  WHERE b.id = p_booking_id
    AND b.status = 'pending'
    AND (
      b.driver_id IS NULL
      OR trim(COALESCE(b.driver_id::text, '')) = ''
      OR b.driver_id::text = uid::text
    )
  RETURNING b.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_debt_limit()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select 3; $function$
;

CREATE OR REPLACE FUNCTION public.send_expo_push(p_token text, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text := trim(COALESCE(p_token, ''));
BEGIN
  IF t = '' THEN
    RETURN;
  END IF;
  IF NOT (
    t LIKE 'ExponentPushToken[%'
    OR t LIKE 'ExpoPushToken[%'
    OR t LIKE 'ExponentPushToken%'
    OR t LIKE 'ExpoPushToken%'
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', t,
      'title', COALESCE(p_title, 'KEKE Manager'),
      'body', COALESCE(p_body, ''),
      'sound', 'default',
      'priority', 'high',
      'channelId', 'bookings',
      'data', COALESCE(p_data, '{}'::jsonb)
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_web_push(p_user_id uuid, p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_url    text;
  v_count  integer;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*) into v_count
  from public.web_push_subscriptions
  where user_id = p_user_id;
  if v_count = 0 then
    return;
  end if;

  select value into v_secret from public.app_settings where key = 'web_push_hook_secret';
  if v_secret is null or v_secret = '' then
    return;
  end if;

  select value into v_url from public.app_settings where key = 'web_push_url';
  if v_url is null or v_url = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-keke-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', coalesce(p_title, 'KEKE Manager'),
      'body', coalesce(p_body, ''),
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.wake_booking_emails()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url from public.app_settings where key = 'booking_email_url';
  select value into v_secret from public.app_settings where key = 'booking_email_hook_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-keke-email-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
end;
$function$
;

-- ===================================================== RLS

alter table public.app_settings enable row level security;
alter table public.booking_emails enable row level security;
alter table public.bookings enable row level security;
alter table public.driver_fleet enable row level security;
alter table public.driver_schedules enable row level security;
alter table public.notifications enable row level security;
alter table public.profiles enable row level security;
alter table public.ratings enable row level security;
alter table public.users enable row level security;
alter table public.vehicles enable row level security;
alter table public.web_push_subscriptions enable row level security;

-- ===================================================== POLICIES

create policy "Companies create bookings" on public.bookings as PERMISSIVE for INSERT to public with check (((auth.uid() = company_id) AND company_can_create_bookings()));
create policy "Companies see own bookings" on public.bookings as PERMISSIVE for SELECT to public using ((auth.uid() = company_id));
create policy "Companies update own bookings" on public.bookings as PERMISSIVE for UPDATE to public using ((auth.uid() = company_id));
create policy "Drivers see assigned bookings" on public.bookings as PERMISSIVE for SELECT to public using ((auth.uid() = driver_id));
create policy "Drivers update assigned bookings" on public.bookings as PERMISSIVE for UPDATE to public using ((auth.uid() = driver_id));
create policy "Enable update for booking owners" on public.bookings as PERMISSIVE for UPDATE to authenticated using ((auth.uid() IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.id = bookings.company_id)))) with check (true);
create policy bookings_admin_select on public.bookings as PERMISSIVE for SELECT to authenticated using (is_admin_user());
create policy bookings_admin_update on public.bookings as PERMISSIVE for UPDATE to authenticated using (is_admin_user()) with check (is_admin_user());
create policy bookings_insert_company on public.bookings as PERMISSIVE for INSERT to authenticated with check ((((company_id)::text = (auth.uid())::text) AND company_can_create_bookings()));
create policy bookings_select_participants on public.bookings as PERMISSIVE for SELECT to authenticated using ((((company_id)::text = (auth.uid())::text) OR ((driver_id)::text = (auth.uid())::text) OR (host_driver_id = auth.uid()) OR ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND (COALESCE(is_group_master, false) = false) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text))) OR ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND (COALESCE(is_group_master, false) = false) AND ((driver_id)::text = (auth.uid())::text))));
create policy bookings_update_assigned_driver on public.bookings as PERMISSIVE for UPDATE to authenticated using (((driver_id)::text = (auth.uid())::text)) with check (((driver_id)::text = (auth.uid())::text));
create policy bookings_update_company on public.bookings as PERMISSIVE for UPDATE to authenticated using (((company_id)::text = (auth.uid())::text)) with check (((company_id)::text = (auth.uid())::text));
create policy bookings_update_driver_accept on public.bookings as PERMISSIVE for UPDATE to authenticated using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text) OR ((driver_id)::text = (auth.uid())::text)))) with check ((((driver_id)::text = (auth.uid())::text) AND (status = ANY (ARRAY['accepted'::text, 'confirmed'::text]))));
create policy bookings_update_driver_reject_open on public.bookings as PERMISSIVE for UPDATE to authenticated using ((is_driver_user() AND (status = 'pending'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text) OR ((driver_id)::text = (auth.uid())::text)))) with check (((status = 'rejected'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text))));
create policy driver_fleet_company_select on public.driver_fleet as PERMISSIVE for SELECT to authenticated using ((is_admin_user() OR ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.company_id)::text = (auth.uid())::text) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])) AND (((b.driver_id)::text = (b.host_driver_id)::text) OR ((b.driver_id)::text = (driver_fleet.sub_driver_id)::text) OR (b.host_driver_id = b.host_driver_id) OR (b.host_driver_id = driver_fleet.sub_driver_id))))))));
create policy driver_fleet_host_delete on public.driver_fleet as PERMISSIVE for DELETE to authenticated using ((host_driver_id = auth.uid()));
create policy driver_fleet_host_insert on public.driver_fleet as PERMISSIVE for INSERT to authenticated with check ((host_driver_id = auth.uid()));
create policy driver_fleet_host_select on public.driver_fleet as PERMISSIVE for SELECT to authenticated using ((host_driver_id = auth.uid()));
create policy driver_fleet_host_update on public.driver_fleet as PERMISSIVE for UPDATE to authenticated using ((host_driver_id = auth.uid())) with check ((host_driver_id = auth.uid()));
create policy driver_fleet_sub_select on public.driver_fleet as PERMISSIVE for SELECT to authenticated using ((sub_driver_id = auth.uid()));
create policy driver_fleet_sub_update_status on public.driver_fleet as PERMISSIVE for UPDATE to authenticated using (((sub_driver_id = auth.uid()) AND (status = 'pending'::text))) with check (((sub_driver_id = auth.uid()) AND (status = ANY (ARRAY['accepted'::text, 'rejected'::text]))));
create policy driver_schedules_company_select on public.driver_schedules as PERMISSIVE for SELECT to authenticated using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.company_id = auth.uid()) AND (b.driver_id = driver_schedules.driver_id) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])) AND (b.driver_id IS NOT NULL)))) OR ((booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_schedules.booking_id) AND (b.company_id = auth.uid()) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])))))))));
create policy driver_schedules_driver_all on public.driver_schedules as PERMISSIVE for ALL to authenticated using ((auth.uid() = driver_id)) with check ((auth.uid() = driver_id));
create policy notifications_select_own on public.notifications as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy notifications_update_own on public.notifications as PERMISSIVE for UPDATE to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Drivers manage own profile" on public.profiles as PERMISSIVE for ALL to public using ((auth.uid() = id));
create policy "Profiles are viewable by everyone" on public.profiles as PERMISSIVE for SELECT to authenticated using (true);
create policy "Users can manage their own profiles" on public.profiles as PERMISSIVE for ALL to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy profiles_insert_self on public.profiles as PERMISSIVE for INSERT to authenticated with check (((id = auth.uid()) AND (COALESCE(is_verified, false) = false)));
create policy profiles_update_self on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check (((id = auth.uid()) AND (NOT (is_verified IS DISTINCT FROM ( SELECT p.is_verified
   FROM profiles p
  WHERE (p.id = auth.uid()))))));
create policy ratings_admin_all on public.ratings as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));
create policy ratings_authenticated_select on public.ratings as PERMISSIVE for SELECT to authenticated using ((((company_id)::text = (auth.uid())::text) OR ((driver_id)::text = (auth.uid())::text) OR is_admin_user()));
create policy ratings_company_insert on public.ratings as PERMISSIVE for INSERT to authenticated with check ((((company_id)::text = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = (ratings.booking_id)::text) AND ((b.company_id)::text = (auth.uid())::text) AND (b.status = 'completed'::text))))));
create policy users_admin_delete on public.users as PERMISSIVE for DELETE to authenticated using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));
create policy users_admin_update on public.users as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));
create policy users_insert_self on public.users as PERMISSIVE for INSERT to authenticated with check (((id = auth.uid()) AND (COALESCE(is_verified, false) = false) AND ((role IS NULL) OR (role = ANY (ARRAY['driver'::text, 'company'::text])))));
create policy users_select_admin on public.users as PERMISSIVE for SELECT to authenticated using (is_admin_user());
create policy users_select_booking_counterparty on public.users as PERMISSIVE for SELECT to authenticated using (has_active_booking_with_user(id));
create policy users_select_self on public.users as PERMISSIVE for SELECT to authenticated using ((id = auth.uid()));
create policy users_update_own_phone on public.users as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check ((id = auth.uid()));
create policy users_update_self on public.users as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check (((id = auth.uid()) AND (NOT (is_verified IS DISTINCT FROM ( SELECT u.is_verified
   FROM users u
  WHERE (u.id = auth.uid())))) AND ((NOT (role IS DISTINCT FROM ( SELECT u.role
   FROM users u
  WHERE (u.id = auth.uid())))) OR ((( SELECT u.role
   FROM users u
  WHERE (u.id = auth.uid())) IS NULL) AND (role = ANY (ARRAY['driver'::text, 'company'::text]))))));
create policy "Drivers manage own vehicle" on public.vehicles as PERMISSIVE for ALL to public using ((auth.uid() = driver_id)) with check ((auth.uid() = driver_id));
create policy vehicles_authenticated_select on public.vehicles as PERMISSIVE for SELECT to authenticated using (true);
create policy vehicles_update_own on public.vehicles as PERMISSIVE for UPDATE to authenticated using (((driver_id)::text = (auth.uid())::text)) with check (((driver_id)::text = (auth.uid())::text));
create policy web_push_own_delete on public.web_push_subscriptions as PERMISSIVE for DELETE to public using ((auth.uid() = user_id));
create policy web_push_own_select on public.web_push_subscriptions as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));

-- ===================================================== TABLE GRANTS

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.app_settings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.booking_emails to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bookings to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bookings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.bookings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.driver_fleet to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.driver_fleet to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.driver_fleet to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.driver_schedules to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.driver_schedules to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notifications to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notifications to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notifications to service_role;
grant DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE on public.profiles to anon;
grant DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE on public.profiles to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.profiles to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ratings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.ratings to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.users to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.users to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.users to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.vehicles to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.vehicles to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.vehicles to service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.web_push_subscriptions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.web_push_subscriptions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.web_push_subscriptions to service_role;

-- ===================================================== COLUMN GRANTS

grant SELECT (id, full_name, vehicle_type, vehicle_class, push_token, created_at, is_verified, languages, avatar_url, birth_date) on public.profiles to authenticated;

-- ===================================================== FUNCTION ACLS

-- revoke first, then grant (a revoke from public after a grant to public would undo it)
revoke all on function public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text) from public;
grant execute on function public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text) to authenticated;
grant execute on function public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text) to service_role;
revoke all on function public.booking_busy_window(p_booking_id uuid) from public;
grant execute on function public.booking_busy_window(p_booking_id uuid) to authenticated;
grant execute on function public.booking_busy_window(p_booking_id uuid) to service_role;
revoke all on function public.booking_notify(p_user_id uuid, p_title text, p_body text, p_type text, p_data jsonb) from public;
grant execute on function public.booking_notify(p_user_id uuid, p_title text, p_body text, p_type text, p_data jsonb) to service_role;
revoke all on function public.booking_route_summary(p_from text, p_to text, p_route text) from public;
grant execute on function public.booking_route_summary(p_from text, p_to text, p_route text) to anon;
grant execute on function public.booking_route_summary(p_from text, p_to text, p_route text) to authenticated;
grant execute on function public.booking_route_summary(p_from text, p_to text, p_route text) to public;
grant execute on function public.booking_route_summary(p_from text, p_to text, p_route text) to service_role;
revoke all on function public.bookings_after_status_change() from public;
grant execute on function public.bookings_after_status_change() to service_role;
revoke all on function public.bookings_queue_company_email() from public;
grant execute on function public.bookings_queue_company_email() to anon;
grant execute on function public.bookings_queue_company_email() to authenticated;
grant execute on function public.bookings_queue_company_email() to public;
grant execute on function public.bookings_queue_company_email() to service_role;
revoke all on function public.bookings_stamp_lifecycle() from public;
grant execute on function public.bookings_stamp_lifecycle() to service_role;
revoke all on function public.company_can_create_bookings() from public;
grant execute on function public.company_can_create_bookings() to authenticated;
grant execute on function public.company_can_create_bookings() to service_role;
revoke all on function public.enforce_company_review_debt() from public;
grant execute on function public.enforce_company_review_debt() to service_role;
revoke all on function public.fetch_user_push_token(p_user_id uuid) from public;
grant execute on function public.fetch_user_push_token(p_user_id uuid) to service_role;
revoke all on function public.has_active_booking_with_user(target_user_id uuid) from public;
grant execute on function public.has_active_booking_with_user(target_user_id uuid) to authenticated;
grant execute on function public.has_active_booking_with_user(target_user_id uuid) to service_role;
revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_admin_user() to service_role;
revoke all on function public.is_driver_user() from public;
grant execute on function public.is_driver_user() to authenticated;
grant execute on function public.is_driver_user() to service_role;
revoke all on function public.parse_booking_start_ts(p_date_display text) from public;
grant execute on function public.parse_booking_start_ts(p_date_display text) to anon;
grant execute on function public.parse_booking_start_ts(p_date_display text) to authenticated;
grant execute on function public.parse_booking_start_ts(p_date_display text) to public;
grant execute on function public.parse_booking_start_ts(p_date_display text) to service_role;
revoke all on function public.queue_booking_email(p_booking_id uuid, p_event text, p_driver_id uuid, p_dedupe text, p_details jsonb, p_delay interval) from public;
grant execute on function public.queue_booking_email(p_booking_id uuid, p_event text, p_driver_id uuid, p_dedupe text, p_details jsonb, p_delay interval) to service_role;
revoke all on function public.reject_pending_booking_as_driver(p_booking_id uuid) from public;
grant execute on function public.reject_pending_booking_as_driver(p_booking_id uuid) to authenticated;
grant execute on function public.reject_pending_booking_as_driver(p_booking_id uuid) to service_role;
revoke all on function public.review_debt_limit() from public;
grant execute on function public.review_debt_limit() to anon;
grant execute on function public.review_debt_limit() to authenticated;
grant execute on function public.review_debt_limit() to public;
grant execute on function public.review_debt_limit() to service_role;
revoke all on function public.send_expo_push(p_token text, p_title text, p_body text, p_data jsonb) from public;
grant execute on function public.send_expo_push(p_token text, p_title text, p_body text, p_data jsonb) to service_role;
revoke all on function public.send_web_push(p_user_id uuid, p_title text, p_body text, p_data jsonb) from public;
grant execute on function public.send_web_push(p_user_id uuid, p_title text, p_body text, p_data jsonb) to service_role;
revoke all on function public.wake_booking_emails() from public;
grant execute on function public.wake_booking_emails() to service_role;

-- ===================================================== TRIGGERS

CREATE TRIGGER bookings_after_status_change AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_after_status_change();
CREATE TRIGGER bookings_queue_company_email AFTER INSERT OR UPDATE OF status, driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_queue_company_email();
CREATE TRIGGER bookings_stamp_lifecycle BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_stamp_lifecycle();
CREATE TRIGGER enforce_company_review_debt BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION enforce_company_review_debt();


reset check_function_bodies;
