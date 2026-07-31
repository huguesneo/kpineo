-- ── Cron du sync des statistiques Instagram ─────────────────────
--
-- Même pattern que meta-ads-hourly-sync (042) : URL et anon key en dur
-- (la anon key est déjà publique côté frontend — safe), fonction déployée
-- avec verify_jwt OFF.
--
-- Toutes les 4 h : suffisant pour attraper les fenêtres d1/d3/d7/d28
-- sans marteler l'API Graph.

SELECT cron.unschedule('social-sync-meta-4h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-sync-meta-4h');

SELECT cron.schedule(
  'social-sync-meta-4h',
  '0 */4 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/social-sync-meta',
      body    := '{}'::jsonb,
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicXdybXljdHNmZHFtZW5jemhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMyNTAsImV4cCI6MjA4ODkyOTI1MH0.uVrAgID_9fvCfJzDKkaMRe-Sx5cxye-BOdpRi2hjAvk"}'::jsonb
    )
  $$
);
