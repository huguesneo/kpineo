-- ── Cron du moteur de scoring ───────────────────────────────────
--
-- Même pattern que meta-ads-hourly-sync (042) et social-sync-meta-4h :
-- URL et anon key en dur (la anon key est déjà publique côté frontend),
-- fonction déployée avec verify_jwt OFF.
--
-- 05h15 : après le passage de 04h00 de social-sync-meta (donc les
-- fenêtres d7 de la nuit sont capturées), avant la lecture du matin.

SELECT cron.unschedule('social-compute-scores-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-compute-scores-daily');

SELECT cron.schedule(
  'social-compute-scores-daily',
  '15 5 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/social-compute-scores',
      body    := '{}'::jsonb,
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicXdybXljdHNmZHFtZW5jemhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMyNTAsImV4cCI6MjA4ODkyOTI1MH0.uVrAgID_9fvCfJzDKkaMRe-Sx5cxye-BOdpRi2hjAvk"}'::jsonb
    )
  $$
);
