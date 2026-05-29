-- Store GHL contact_id so we can match tasks of the same client across types
-- (e.g. an annulation webhook removes a pending confirmation_rdv task).
alter table setter_shared_tasks add column if not exists contact_id text;
create index if not exists setter_shared_tasks_contact_id_idx
  on setter_shared_tasks (contact_id);
