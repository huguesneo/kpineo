-- =============================================================================
-- Module Montage vidéo : timeline ouverte aux vidéos « Une cliente » (15 oct. 2026, décision de Hugues)
-- =============================================================================
-- Après 20261015a et 20261015b. Remplace la fermeture du matin : la timeline (préparer, appliquer, vérifications)
-- est permise pour une cliente. La transcription reste Whisper sur le Mac : le moteur refuse Scribe pour une cliente
-- (video-neo, moteur/neo_moteur/transcription.py) ; rien ici n'y touche. Les copies d'une cliente sont effacées par
-- l'agent dès Terminer, et au plus tard 24 h après la dernière modification.
-- Seuls changements : le déclencheur video_taches_timeline_cliente est retiré, et la fonction des vérifications
-- perd son refus « cliente » (le reste à l'identique). Retour : supabase/retours/20261015c_montage_video_timeline_cliente_retour.sql

BEGIN;

DROP TRIGGER IF EXISTS video_taches_timeline_cliente ON public.video_taches;
DROP FUNCTION IF EXISTS public.video_taches_timeline_cliente();

-- Une demande du hub naît « en_attente », à son nom (cliente comprise)
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
  RETURN NEW;
END;
$$;

COMMIT;
