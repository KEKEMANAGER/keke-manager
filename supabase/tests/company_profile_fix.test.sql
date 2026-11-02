-- A company held until it corrects its profile (its real company name, a
-- logo) is let back in by the server the moment it has — and by nothing else.
-- Accounts from fixtures/p0_5_seed.sql (companies C1, C2, admin ADM) plus a
-- company that signs up here (NEWCO). Every write is made the way PostgREST
-- makes it (role authenticated + the caller's JWT), under production's RLS
-- policies on users. One transaction, rolled back; nothing leaves the machine.
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

create or replace function tests.co(p_name text) returns record language sql security definer set search_path = public as $$
  select u.verification_status, u.is_verified, u.profile_fix is not null, u.rejection_reason is not null,
         (select p.is_verified from public.profiles p where p.id = u.id)
    from public.users u where u.id = tests.p5(p_name)
$$;
create or replace function tests.can_book_as(p_name text) returns boolean language plpgsql as $$
declare ok boolean;
begin
  perform tests.act_as(tests.p5(p_name));
  ok := public.company_can_create_bookings();
  perform tests.act_as_owner();
  return ok;
end $$;
grant execute on all functions in schema tests to public;

-- 0. a request cannot come in with a sign-up (it would let a company approve itself)
select tests.act_as_owner();
insert into auth.users (id, email) values (tests.p5('NEWCO'), 'newco@p05.test');
select tests.act_as(tests.p5('NEWCO'));
select throws_ok(format($q$insert into public.users (id, role, full_name, profile_fix)
  values (%L, 'company', 'New Co', '{"fields":["logo"]}')$q$, tests.p5('NEWCO')), '42501', 'profile_fix is set by KEKE Manager',
  'P1 a new company cannot sign up with a request of its own');
select is(tests.try_sql(format($q$insert into public.users (id, role, full_name) values (%L, 'company', 'New Co')$q$,
  tests.p5('NEWCO'))), 1, 'P2 the same sign-up without one goes through');

-- C1 registered under a person's name and no logo; C2 is held for other reasons.
select tests.act_as_owner();
update public.users set full_name = 'Nini rogava', avatar_url = null where id = tests.p5('C1');

-- 1. the admin holds C1 with a request; a company cannot make or drop one
select tests.act_as(tests.p5('ADM'));
select is(tests.try_sql(format($q$update public.users set verification_status = 'rejected', is_verified = false,
  rejection_reason = 'fix your name and logo', profile_fix = '{"fields":["company_name","logo"],"name_was":"Nini rogava"}'
  where id = %L$q$, tests.p5('C1'))), 1, 'P3 an admin holds a company with a request to fix its name and logo');
select is(tests.try_sql(format($q$update public.users set verification_status = 'rejected', is_verified = false,
  rejection_reason = 'documents do not match' where id = %L$q$, tests.p5('C2'))), 1, 'P4 an admin holds another company without a request');
-- the admin panel's reject also clears profiles.is_verified (adminVerification.ts)
select tests.act_as_owner();
update public.profiles set is_verified = false where id in (tests.p5('C1'), tests.p5('C2'));
select is(tests.can_book_as('C1'), false, 'P5 the held company cannot create bookings');

select tests.act_as(tests.p5('C1'));
select throws_ok(format('update public.users set profile_fix = null where id = %L', tests.p5('C1')), '42501',
  'profile_fix is set by KEKE Manager', 'P6 the company cannot drop the request');
select tests.act_as(tests.p5('C2'));
select throws_ok(format($q$update public.users set profile_fix = '{"fields":["logo"]}' where id = %L$q$, tests.p5('C2')), '42501',
  'profile_fix is set by KEKE Manager', 'P7 nor make one for itself');

-- 2. only the full correction lets it back in
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format($q$update public.users set avatar_url = 'https://x.test/logo.png' where id = %L$q$, tests.p5('C1'))), 1,
  'P8 the company uploads its logo');
select tests.act_as_owner();
select is((select tests.co('C1')::text), '(rejected,f,t,t,f)', 'P9 a logo alone is not enough: still held, request still open');
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format($q$update public.users set full_name = '  NINI ROGAVA ' where id = %L$q$, tests.p5('C1'))), 1,
  'P10 the company re-types the same name');
select tests.act_as_owner();
select is((select tests.co('C1')::text), '(rejected,f,t,t,f)', 'P11 the same name in other letters is not a correction');
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format($q$update public.users set full_name = 'G' where id = %L$q$, tests.p5('C1'))), 1,
  'P12 the company types a single letter');
select tests.act_as_owner();
select is((select tests.co('C1')::text), '(rejected,f,t,t,f)', 'P13 one letter is not a company name');
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format($q$update public.users set full_name = 'Geo Travel Club' where id = %L$q$, tests.p5('C1'))), 1,
  'P14 the company gives its real name');
select tests.act_as_owner();
select is((select tests.co('C1')::text), '(approved,t,f,f,f)', 'P15 corrected: approved again, request and reason cleared');
select is(tests.can_book_as('C1'), true, 'P16 and it can create bookings again');

-- 3. a logo has to be a picture link
select tests.act_as(tests.p5('ADM'));
select is(tests.try_sql(format($q$update public.users set verification_status = 'rejected', is_verified = false,
  rejection_reason = 'fix your name and logo', profile_fix = '{"fields":["company_name","logo"],"name_was":"New Co"}'
  where id = %L$q$, tests.p5('NEWCO'))), 1, 'P17 an admin holds the new company with a request');
select tests.act_as(tests.p5('NEWCO'));
select is(tests.try_sql(format($q$update public.users set full_name = 'Real Tours', avatar_url = 'logo.png' where id = %L$q$,
  tests.p5('NEWCO'))), 1, 'P18 it gives a real name, and a logo that is not a picture link');
select tests.act_as_owner();
select is((select (tests.co('NEWCO')::text)), '(rejected,f,t,t,)', 'P19 still held');
select tests.act_as(tests.p5('NEWCO'));
select is(tests.try_sql(format($q$update public.users set avatar_url = 'https://x.test/newco.png' where id = %L$q$,
  tests.p5('NEWCO'))), 1, 'P20 it uploads a real logo');
select tests.act_as_owner();
select is((select (tests.co('NEWCO')::text)), '(approved,t,f,f,)', 'P21 and is let in');

-- 4. no one else is let in by it
select tests.act_as(tests.p5('C2'));
select is(tests.try_sql(format($q$update public.users set full_name = 'Another Name', avatar_url = 'https://x.test/l2.png' where id = %L$q$, tests.p5('C2'))), 1,
  'P22 a company held without a request edits its name and logo');
select tests.act_as_owner();
select is((select tests.co('C2')::text), '(rejected,f,f,t,f)', 'P23 it stays held: only a request can be answered this way');
select tests.act_as(tests.p5('C2'));
select is(tests.try_sql(format($q$update public.users set verification_status = 'approved' where id = %L$q$, tests.p5('C2'))), -1,
  'P24 and it still cannot approve itself');

-- 5. the admin can withdraw a request
select tests.act_as_owner();
update public.users set profile_fix = '{"fields":["logo"]}', verification_status = 'rejected', is_verified = false where id = tests.p5('C2');
select tests.act_as(tests.p5('ADM'));
select is(tests.try_sql(format('update public.users set profile_fix = null where id = %L', tests.p5('C2'))), 1,
  'P25 an admin can withdraw a request');

select tests.act_as_owner();
select * from finish();
rollback;
