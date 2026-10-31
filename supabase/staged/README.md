# Staged migrations

Migrations that are written and tested but must wait for something outside
the database before they are applied. The Supabase CLI never reads this
folder, so `supabase db push` does not apply them.

| File | Waits for | Then |
|---|---|---|
| `20261031180100_open_jobs_summary_only.sql` (P0-3 part B) | Part A (`supabase/migrations/20261031180000_driver_eligibility.sql`) applied, and the app update that reads open jobs through `driver_open_jobs()` live on the website and published to the phones | Move it into `supabase/migrations` under a timestamp later than part A's and apply it. Undo: `supabase/rollback/20261031180100_open_jobs_summary_only_undo.sql` |
| `20261101090100_push_tokens_private.sql` (P0-4 part B) | Part A (`supabase/migrations/20261101090000_push_tokens_server_delivery.sql`) applied, and the app update that sends notifications through the server (`dispatch_new_booking`, `notify_booking_event`, …) live on the website and published to the phones | Move it into `supabase/migrations` under a timestamp later than part A's and apply it. Phones still on the old version keep working: their notices go through the server, new bookings from them reach drivers through the one-minute fallback. Undo: `supabase/rollback/20261101090100_push_tokens_private_undo.sql` |
