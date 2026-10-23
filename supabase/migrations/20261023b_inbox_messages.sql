-- Adjoint, temps réel : la boîte de réception de info@ dans le hub (neo-admin).
-- gmail-sync (chaque minute, pg_cron) copie ici les courriels arrivés dans INBOX depuis
-- le dernier historyId de Gmail, puis les relie aux dossiers de Léo (projet Clinique).
-- La page Adjoint lit cette table (Realtime) pour montrer « Pas encore traité par Léo ».

create table if not exists public.inbox_messages (
  gmail_message_id   text primary key,
  gmail_thread_id    text not null,
  expediteur         text,
  expediteur_nom     text,
  sujet              text,
  extrait            text,
  recu_le            timestamptz not null,
  libelles           text[] not null default '{}',
  etat               text not null default 'nouveau'
                     check (etat in ('nouveau', 'traite_par_leo', 'traite_dans_hub')),
  leo_interaction_id uuid,           -- leo_service_interactions.id (projet Clinique)
  cree_le            timestamptz not null default now(),
  maj_le             timestamptz not null default now()
);

create index if not exists inbox_messages_etat_recu on public.inbox_messages (etat, recu_le desc);
create index if not exists inbox_messages_fil on public.inbox_messages (gmail_thread_id);
create index if not exists inbox_messages_leo on public.inbox_messages (leo_interaction_id) where leo_interaction_id is not null;

-- Lecture : Hugues et Cloé (info@), comme la page Adjoint. Écritures : edge functions
-- (clé service) seulement.
alter table public.inbox_messages enable row level security;
drop policy if exists inbox_messages_lecture_adjoint on public.inbox_messages;
create policy inbox_messages_lecture_adjoint on public.inbox_messages
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') in ('hugues@neoperformance.ca', 'info@neoperformance.ca'));

-- Point de reprise de la synchro (une seule ligne) et table des libellés Gmail (id → nom)
create table if not exists public.gmail_sync_etat (
  id              smallint primary key default 1 check (id = 1),
  history_id      text,
  libelles        jsonb not null default '{}',
  derniere_sync   timestamptz,
  derniere_erreur text
);
alter table public.gmail_sync_etat enable row level security;

alter publication supabase_realtime add table public.inbox_messages;

-- Secret de gmail-sync : généré ici par la base (jamais dans git), gardé dans Vault.
-- Le cron l'envoie dans l'en-tête x-gmail-sync-secret ; gmail-sync le vérifie avec
-- gmail_sync_secret_ok() (clé service seulement). Tout autre appel reçoit 401.
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'gmail_sync_secret', 'En-tête du cron gmail-sync')
where not exists (select 1 from vault.secrets where name = 'gmail_sync_secret');

create or replace function public.gmail_sync_secret_ok(jeton text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(jeton, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'gmail_sync_secret' and decrypted_secret = jeton
  );
$$;
revoke all on function public.gmail_sync_secret_ok(text) from public, anon, authenticated;
grant execute on function public.gmail_sync_secret_ok(text) to service_role;

-- Chaque minute, avec le secret lu dans Vault
select cron.schedule(
  'gmail-sync',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/gmail-sync',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-gmail-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_secret')
      )
    );
  $$
);
