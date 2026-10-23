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

-- Chaque minute. gmail-sync est déployée sans vérification JWT (comme setting-cycle) :
-- un appel ne fait que lire les changements de Gmail et ne renvoie rien de sensible.
select cron.schedule(
  'gmail-sync',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/gmail-sync',
      body    := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);
