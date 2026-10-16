-- Annule supabase/migrations/20261016a_setting_v2.sql (Setting v2).
-- À exécuter dans l'éditeur SQL de Supabase. Ne touche à rien d'autre.
-- Effet : retire le cron, les tables setting_* (et leurs données : journal
-- d'appels copié, rappels, résultats, propriétés, tâches automatiques) et les
-- colonnes d'archivage de setter_shared_tasks : les tâches archivées
-- redeviennent visibles telles qu'avant (la liste exportée est dans
-- docs/archives/taches-setters-a-archiver-2026-10-16.csv).
-- Rien n'est jamais écrit dans GHL par ce script.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'setting-cycle') THEN
    PERFORM cron.unschedule('setting-cycle');
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['setting_appels', 'setting_proprietes', 'setting_rappels', 'setting_resultats', 'setting_taches'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Déclencheur de 20261016b (s'il existe) : à retirer avant les tables
DROP TRIGGER IF EXISTS trg_setting_rdv_reserve ON public.ghl_appointments;
DROP FUNCTION IF EXISTS public.setting_rdv_reserve();

DROP TRIGGER IF EXISTS trg_setting_taches_garde ON public.setting_taches;
DROP FUNCTION IF EXISTS public.setting_taches_garde();
DROP FUNCTION IF EXISTS public.setting_contacts_traites(integer);
DROP FUNCTION IF EXISTS public.setting_nq_par_source(integer);

DROP TABLE IF EXISTS public.setting_taches;
DROP TABLE IF EXISTS public.setting_resultats;
DROP TABLE IF EXISTS public.setting_rappels;
DROP TABLE IF EXISTS public.setting_proprietes;
DROP TABLE IF EXISTS public.setting_appels;
DROP TABLE IF EXISTS public.setting_config;

ALTER TABLE public.setter_shared_tasks DROP COLUMN IF EXISTS archived_reason;
ALTER TABLE public.setter_shared_tasks DROP COLUMN IF EXISTS archived_at;
