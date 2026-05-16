create table if not exists public.messages (
  id          uuid        default gen_random_uuid() primary key,
  sender_id   uuid        not null references auth.users(id) on delete cascade,
  receiver_id uuid        not null references auth.users(id) on delete cascade,
  booking_id  uuid        references public.bookings(id) on delete set null,
  text        text        not null check (char_length(trim(text)) > 0),
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_participants_select"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "messages_sender_insert"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "messages_receiver_update"
  on public.messages for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create index if not exists messages_sender_receiver_idx
  on public.messages (sender_id, receiver_id, created_at desc);

create index if not exists messages_receiver_created_idx
  on public.messages (receiver_id, created_at desc);

alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;
