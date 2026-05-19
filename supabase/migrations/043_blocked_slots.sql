-- Optional manual GHL calendar ID per profile
alter table profiles add column if not exists ghl_calendar_id text;

-- Blocked time slots (one row per occurrence, recurring linked by group_id)
create table if not exists blocked_slots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references profiles(id) on delete cascade not null,
  title               text not null default 'Bloqué',
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  recurrence_type     text default 'none' check (recurrence_type in ('none', 'daily', 'weekly')),
  recurrence_group_id uuid,
  recurrence_until    date,
  ghl_event_id        text,
  created_at          timestamptz default now()
);

create index if not exists blocked_slots_user_time_idx on blocked_slots(user_id, start_time);
create index if not exists blocked_slots_group_idx     on blocked_slots(recurrence_group_id)
  where recurrence_group_id is not null;

alter table blocked_slots enable row level security;

drop policy if exists "Users manage own blocks" on blocked_slots;
create policy "Users manage own blocks" on blocked_slots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Admins read blocks" on blocked_slots;
create policy "Admins read blocks" on blocked_slots
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'resp_vente'))
  );
