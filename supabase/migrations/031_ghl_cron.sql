-- ── GHL Incremental Sync — Cron toutes les 30 minutes ──────────
--
-- AVANT D'APPLIQUER : exécute cette ligne dans le SQL Editor de Supabase
-- avec la valeur de Settings → API → anon public (clé publique, safe à stocker) :
--
--   ALTER DATABASE postgres SET app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
--
-- NB : La anon key est déjà publique (dans le code frontend).
--      La Edge Function utilise sa propre service_role_key en interne via Deno.env.
--

-- Extensions requises (déjà activées sur Supabase Cloud)
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Fonction appelée par pg_cron
CREATE OR REPLACE FUNCTION internal.trigger_ghl_incremental_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id TEXT;
  v_url         TEXT;
  v_key         TEXT;
BEGIN
  SELECT location_id INTO v_location_id FROM public.ghl_config LIMIT 1;
  IF v_location_id IS NULL THEN
    RAISE LOG 'GHL cron: aucun location_id configuré, sync ignorée';
    RETURN;
  END IF;

  v_url := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/gohighlevel-sync';
  v_key := current_setting('app.supabase_anon_key');

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'action',     'sync_incremental',
      'locationId', v_location_id
    )::text
  );
END;
$$;

-- Planification : toutes les 30 minutes
SELECT cron.schedule(
  'ghl-incremental-sync',
  '*/30 * * * *',
  'SELECT internal.trigger_ghl_incremental_sync()'
);
