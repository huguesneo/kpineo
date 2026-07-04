-- ── Fix du cron meta-ads-hourly-sync ────────────────────────────
--
-- Le job original lisait `SELECT value FROM vault.decrypted_secrets`
-- (la colonne s'appelle `decrypted_secret`) ET les secrets
-- 'supabase_url' / 'supabase_anon_key' n'existaient pas dans le vault.
-- → échec silencieux à chaque heure depuis sa création.
--
-- On adopte le même pattern que ghl-incremental-sync (031) : URL et
-- anon key en dur. La anon key est déjà publique (frontend) — safe.

SELECT cron.unschedule('meta-ads-hourly-sync');

SELECT cron.schedule(
  'meta-ads-hourly-sync',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/meta-ads-sync',
      body    := '{"action":"sync_all"}'::jsonb,
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicXdybXljdHNmZHFtZW5jemhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMyNTAsImV4cCI6MjA4ODkyOTI1MH0.uVrAgID_9fvCfJzDKkaMRe-Sx5cxye-BOdpRi2hjAvk"}'::jsonb
    )
  $$
);
