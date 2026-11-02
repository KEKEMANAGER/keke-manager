-- Undo 20261102140000_company_profile_fix.sql.
--
-- The trigger goes; the column and any request in it stay (nothing is
-- deleted). A company that was held stays held until an admin approves it in
-- the panel, exactly as before this migration.

drop trigger if exists users_profile_fix on public.users;
drop function if exists public.users_profile_fix();
