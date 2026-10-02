-- Small server-side key/value store for things the system can work out for
-- itself rather than make a person configure.
--
-- Wiring the price bot up used to take three secrets. Two of them were busywork:
-- the chat id is whatever chat says /start to the bot, and the webhook secret is
-- a random string whose only job is to prove a call came from Telegram — there
-- is no reason a person should have to invent it. Both now live here, and the
-- only thing a human supplies is the bot token.
--
-- No client policies: read and written by SECURITY DEFINER paths and the
-- service role only.

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
