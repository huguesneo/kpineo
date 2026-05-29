-- Add contact_url field for GHL contact link
alter table setter_shared_tasks add column if not exists contact_url text;
