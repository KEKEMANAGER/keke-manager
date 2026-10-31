# Staged migrations

Migrations that are written and tested but must wait for something outside
the database before they are applied. The Supabase CLI never reads this
folder, so `supabase db push` does not apply them.

| File | Waits for | Then |
|---|---|---|
| `20261031180100_open_jobs_summary_only.sql` (P0-3 part B) | Part A (`supabase/migrations/20261031180000_driver_eligibility.sql`) applied, and the app update that reads open jobs through `driver_open_jobs()` live on the website and published to the phones | Move it into `supabase/migrations` under a timestamp later than part A's and apply it. Undo: `supabase/rollback/20261031180100_open_jobs_summary_only_undo.sql` |
