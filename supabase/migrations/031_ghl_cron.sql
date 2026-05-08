-- ── GHL Incremental Sync — Cron toutes les 30 minutes ──────────
--
-- Remplace ANON_KEY_ICI par ta clé publique (anon key) :
-- Supabase Dashboard → Settings → API → anon public
--
-- La anon key est déjà publique (dans le code frontend) — safe à mettre ici.
-- La Edge Function utilise sa propre service_role_key via Deno.env en interne.
--

-- Extensions requises (déjà activées sur Supabase Cloud)
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Fonction appelée par pg_cron
CREATE OR REPLACE FUNCTION public.trigger_ghl_incremental_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id TEXT;
  v_anon_key    TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicXdybXljdHNmZHFtZW5jemhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTMyNTAsImV4cCI6MjA4ODkyOTI1MH0.uVrAgID_9fvCfJzDKkaMRe-Sx5cxye-BOdpRi2hjAvk';
BEGIN
  SELECT location_id INTO v_location_id FROM public.ghl_config LIMIT 1;
  IF v_location_id IS NULL THEN
    RAISE LOG 'GHL cron: aucun location_id configuré, sync ignorée';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/gohighlevel-sync',
    body    := jsonb_build_object('action', 'sync_incremental', 'locationId', v_location_id),
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || v_anon_key || '"}')::jsonb
  );
END;
$$;

-- Planification : toutes les 30 minutes
SELECT cron.schedule(
  'ghl-incremental-sync',
  '*/30 * * * *',
  'SELECT public.trigger_ghl_incremental_sync()'
);
