-- Sale Call Notes table
-- Stores closer's qualification form answers for each appointment
create table if not exists sale_call_notes (
  id                  uuid        default gen_random_uuid() primary key,
  appointment_ghl_id  text        not null,
  user_id             uuid        references profiles(id) on delete set null,
  contact_id          text,
  contact_name        text,
  qualification       jsonb       default '{}',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists sale_call_notes_appt_idx on sale_call_notes(appointment_ghl_id);
create index if not exists sale_call_notes_user_idx on sale_call_notes(user_id);

-- Enable RLS
alter table sale_call_notes enable row level security;

-- Policy: closers can read/write their own notes, admins can read all
drop policy if exists "Users can manage their own sale call notes" on sale_call_notes;
create policy "Users can manage their own sale call notes"
  on sale_call_notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Admins can read all sale call notes" on sale_call_notes;
create policy "Admins can read all sale call notes"
  on sale_call_notes for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin', 'resp_vente')
    )
  );

-- Fathom integration columns on profiles
alter table profiles
  add column if not exists fathom_api_key          text,
  add column if not exists fathom_webhook_secret    text;
