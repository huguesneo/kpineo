-- Quiz responses received from Make.com webhook
create table if not exists quiz_responses (
  id                      uuid default gen_random_uuid() primary key,
  email                   text not null,
  questionnaire_sexe      text,
  questionnaire_age       text,
  questionnaire_energie   text,
  questionnaire_stockage  text,
  questionnaire_ventre    text,
  questionnaire_symptomes text,
  questionnaire_objectifs text,
  questionnaire_motivation text,
  questionnaire_engagement text,
  source                  text,
  raw                     jsonb default '{}',
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter table quiz_responses add constraint quiz_responses_email_key unique (email);

-- Allow all authenticated users to read quiz responses
alter table quiz_responses enable row level security;

drop policy if exists "authenticated read" on quiz_responses;
create policy "authenticated read" on quiz_responses
  for select to authenticated using (true);

-- Service role can upsert (used by edge function)
drop policy if exists "service upsert" on quiz_responses;
create policy "service upsert" on quiz_responses
  for all using (true) with check (true);
