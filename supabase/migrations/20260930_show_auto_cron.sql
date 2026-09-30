-- Show automatique côté serveur : chaque minute, passe en « show » les
-- rendez-vous terminés dont la fiche de qualification est remplie
-- (voir supabase/functions/show-auto, déployée sans vérification JWT :
-- elle ne reçoit aucune donnée et applique ses propres règles).
SELECT cron.schedule(
  'show-auto',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/show-auto',
      body    := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);
