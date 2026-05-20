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
