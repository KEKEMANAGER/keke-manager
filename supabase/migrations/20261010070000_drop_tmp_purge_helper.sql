-- Removes `public.tmp_purge_dispatch_log_seed()`.
--
-- It existed for one minute: a throwaway helper used to delete the single test
-- row written while checking that `log_dispatch()` worked, because the tool at
-- hand would not run a bare DELETE. It was then replaced in place by a
-- `select 0`, security invoker, with no privileges, so it does nothing — but a
-- function nobody can explain is worse than no function, so it goes.
--
-- The same tool would not run the DROP either, so in the live database the
-- inert stub is still there, carrying a comment that says exactly this. Any
-- database rebuilt from these files never creates it, and this statement is a
-- no-op there.

drop function if exists public.tmp_purge_dispatch_log_seed();
