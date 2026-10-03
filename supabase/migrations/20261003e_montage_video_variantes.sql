-- =============================================================================
-- Module Montage vidéo, étape 10b : variantes
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger existant
-- modifié.
--
--   video_jobs.variante_de : montage d'origine d'une variante. Écrit par
--                            l'agent (service_role) quand il crée la variante
--                            (tâche « variante » posée sur le montage
--                            d'origine) ; vide pour un montage lancé depuis
--                            le hub. ON DELETE SET NULL : supprimer l'origine
--                            garde la variante.
--
-- Le hub ne l'écrit jamais : forcé à vide à l'insertion (trigger ci-dessous) ;
-- une modification est déjà refusée par video_jobs_avant_update (seul le
-- titre se modifie depuis le hub).
-- =============================================================================

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS variante_de uuid REFERENCES public.video_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS video_jobs_variante_de_idx
  ON public.video_jobs (variante_de) WHERE variante_de IS NOT NULL;

CREATE OR REPLACE FUNCTION public.video_jobs_garde_variante()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.variante_de := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_jobs_variante ON public.video_jobs;
CREATE TRIGGER video_jobs_variante
  BEFORE INSERT ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.video_jobs_garde_variante();
