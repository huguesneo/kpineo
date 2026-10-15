-- =============================================================================
-- RETOUR EN ARRIÈRE de 20261015c_montage_video_timeline_cliente.sql (jamais appliqué sans l'OK de Hugues)
-- =============================================================================
-- Referme la timeline aux vidéos d'une cliente, comme 20261015a. Avant : remettre l'agent sur une version qui
-- refuse aussi la timeline pour une cliente, puis effacer ses copies du bucket par l'API Storage.

BEGIN;

CREATE OR REPLACE FUNCTION public.video_taches_timeline_cliente()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IN ('timeline_preparer','timeline_appliquer') AND EXISTS (
    SELECT 1 FROM public.video_jobs WHERE id = NEW.job_id AND personnes = 'cliente'
  ) THEN
    RAISE EXCEPTION 'La timeline est fermée pour les vidéos d''une cliente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_taches_timeline_cliente ON public.video_taches;
CREATE TRIGGER video_taches_timeline_cliente
  BEFORE INSERT ON public.video_taches
  FOR EACH ROW EXECUTE FUNCTION public.video_taches_timeline_cliente();

CREATE OR REPLACE FUNCTION public.video_timeline_requetes_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.statut     := 'en_attente';
    NEW.cree_par   := COALESCE(auth.jwt() ->> 'email', '');
    NEW.reponse    := NULL;
    NEW.erreur     := NULL;
    NEW.traitee_le := NULL;
    IF octet_length(NEW.recette::text) > 1000000 THEN
      RAISE EXCEPTION 'Recette trop grosse (1 Mo au plus)';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.video_jobs WHERE id = NEW.job_id AND personnes = 'cliente') THEN
    RAISE EXCEPTION 'La timeline est fermée pour les vidéos d''une cliente';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
