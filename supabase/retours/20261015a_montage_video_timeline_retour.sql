-- =============================================================================
-- RETOUR EN ARRIÈRE de 20261015a_montage_video_timeline.sql (jamais appliqué sans l'OK de Hugues)
-- =============================================================================
-- Avant : arrêter l'agent vidéo (ou le remettre sur la version d'avant la timeline), puis
-- vider le bucket video-timeline par l'API Storage (tableau de bord Supabase ou agent) :
-- Supabase refuse de supprimer des objets de storage.objects en SQL.
-- Les tâches timeline_* restent dans l'historique : elles sont passées en erreur pour que
-- l'ancienne contrainte puisse revenir.

BEGIN;

UPDATE public.video_taches
   SET statut = 'erreur', erreur = COALESCE(erreur, 'Timeline retirée (retour en arrière)')
 WHERE type IN ('timeline_preparer','timeline_appliquer') AND statut IN ('en_attente','en_cours');
DELETE FROM public.video_taches WHERE type IN ('timeline_preparer','timeline_appliquer');

ALTER TABLE public.video_taches DROP CONSTRAINT IF EXISTS video_taches_type_check;
ALTER TABLE public.video_taches ADD CONSTRAINT video_taches_type_check
  CHECK (type IN ('montage','correction_sous_titres','restaurer','terminer','variante','enregistrer_style'));

DROP TRIGGER IF EXISTS video_taches_timeline_cliente ON public.video_taches;
DROP FUNCTION IF EXISTS public.video_taches_timeline_cliente();

DROP POLICY IF EXISTS video_timeline_read ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'video-timeline'
  AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'video-timeline');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['video_timeline','video_timeline_requetes'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

DROP TABLE IF EXISTS public.video_timeline_requetes;
DROP FUNCTION IF EXISTS public.video_timeline_requetes_avant_insert();
DROP TABLE IF EXISTS public.video_timeline;
DROP FUNCTION IF EXISTS public.video_timeline_avant_update();

COMMIT;
