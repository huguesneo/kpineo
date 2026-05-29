-- Setter shared task board
-- Tasks visible to all setter-role users; personal tasks are scoped by user_id

create table setter_shared_tasks (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null    default now(),
  type            text        not null    check (type in ('no_show', 'annulation', 'confirmation_rdv', 'nouveau_lead', 'personnel')),
  title           text        not null,
  description     text,

  -- GHL-sourced client data (null for manual tasks)
  client_name     text,
  client_phone    text,
  client_email    text,
  appointment_date text,
  closer_name     text,

  -- Completion (shared: first setter to check = done for everyone)
  is_completed    boolean     not null    default false,
  completed_by    uuid        references auth.users(id) on delete set null,
  completed_at    timestamptz,

  -- Personal tasks only: scoped to a specific user
  user_id         uuid        references auth.users(id) on delete cascade,

  created_by      uuid        references auth.users(id) on delete set null
);

alter table setter_shared_tasks enable row level security;

-- Authenticated users can read (app layer handles role filtering)
create policy "auth_read_setter_shared_tasks"
  on setter_shared_tasks for select
  to authenticated
  using (true);

create policy "auth_insert_setter_shared_tasks"
  on setter_shared_tasks for insert
  to authenticated
  with check (true);

create policy "auth_update_setter_shared_tasks"
  on setter_shared_tasks for update
  to authenticated
  using (true);

-- Only creator or service_role can delete
create policy "creator_delete_setter_shared_tasks"
  on setter_shared_tasks for delete
  to authenticated
  using (created_by = auth.uid());

-- Service role bypass for webhooks
create policy "service_role_all_setter_shared_tasks"
  on setter_shared_tasks for all
  to service_role
  using (true)
  with check (true);

-- Index for common queries
create index idx_setter_shared_tasks_type        on setter_shared_tasks (type);
create index idx_setter_shared_tasks_is_completed on setter_shared_tasks (is_completed);
create index idx_setter_shared_tasks_user_id      on setter_shared_tasks (user_id);
