-- Fix FK references: point to profiles instead of auth.users
-- so Supabase can join profiles(full_name) in queries

alter table setter_shared_tasks
  drop constraint if exists setter_shared_tasks_completed_by_fkey;
alter table setter_shared_tasks
  drop constraint if exists setter_shared_tasks_created_by_fkey;
alter table setter_shared_tasks
  drop constraint if exists setter_shared_tasks_user_id_fkey;

alter table setter_shared_tasks
  add constraint setter_shared_tasks_completed_by_fkey
    foreign key (completed_by) references profiles(id) on delete set null;
alter table setter_shared_tasks
  add constraint setter_shared_tasks_created_by_fkey
    foreign key (created_by) references profiles(id) on delete set null;
alter table setter_shared_tasks
  add constraint setter_shared_tasks_user_id_fkey
    foreign key (user_id) references profiles(id) on delete cascade;
