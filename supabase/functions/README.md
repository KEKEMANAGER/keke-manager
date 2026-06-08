# Supabase Edge Functions

## `admin-delete-user`

Deletes a user from `public.users` and from Supabase Auth. **Only callers with `users.role = 'admin'` may invoke it.** The service role key is available only inside the function (Deno secrets), never in the mobile app.

### Deploy

```bash
supabase secrets set --project-ref <REF> SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
# SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically on hosted projects

supabase functions deploy admin-delete-user --project-ref <REF>
```

For local testing, use `supabase functions serve` and `.env` as documented in Supabase CLI.

### Client

The app calls `supabase.functions.invoke('admin-delete-user', { body: { userId } })` with the logged-in admin session (JWT).

## `booking-reminders`

Scheduled Edge Function (hourly cron) that sends Expo push notifications for upcoming assigned bookings:

| Timing | Recipient | Message (ka) |
|--------|-----------|--------------|
| ~12h before | Driver | `12 საათში გაქვს [type]: [route] - [date/time]` |
| ~1h 45m before | Driver | `1 საათ 45 წუთში გაქვს [type]: [route]. შეძლებ? გთხოვ დაადასტურე` |
| 24 min after confirm push, no response | Auto | Reassign to next matching driver (vehicle type/class, category, languages); notify company + new driver |
| Reassign failed (no driver) | Company | Manual assignment needed |

Requires migration `20260530120000_booking_reminder_columns.sql` (`reminder_*`, `driver_confirmed_1h`, etc.).

### Deploy

```bash
supabase db push   # or apply migration on hosted project

supabase functions deploy booking-reminders --project-ref <REF>
```

Cron is set via migration `20260701120000_booking_reminders_cron.sql` (`pg_cron`, hourly `0 * * * *`). Apply on hosted Supabase (SQL Editor or `db push`). Verify with:

```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'booking-reminders-hourly';
```

The function uses `SUPABASE_SERVICE_ROLE_KEY` (injected automatically) and reads `profiles.push_token` (fallback `users.push_token`).

Drivers confirm in the app via `lib/bookingReminders.ts` → sets `driver_confirmed_1h = true`.
