-- =============================================================================
-- Module Montage vidéo : corbeille (supprimer / restaurer un montage)
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger existant
-- réécrit.
--
--   video_jobs.supprime_le / supprime_par : le montage est dans la corbeille
--                                           depuis quand, mis par qui.
--
-- Suppression douce : rien d'autre ne change. Clips, versions, tâches, branche
-- git, aperçus et exports Drive restent tels quels ; l'agent n'a rien à faire.
-- Restaurer remet simplement les deux colonnes à vide.
--
-- Le hub ne peut toujours changer que le titre d'un montage (trigger
-- video_jobs_avant_update) : il passe par video_supprimer_montage(id) et
-- video_restaurer_montage(id) (SECURITY DEFINER), seules portes d'entrée.
--   - Supprimer est refusé si une tâche du montage est en attente ou en cours.
--   - Un montage dans la corbeille ne reçoit ni tâche (demande, variante,
--     Terminer…) ni clip depuis le hub, tant qu'il n'est pas restauré.
-- Droits : has_montage_access() (hugues@ et info@).
-- Retours : 'supprime' / 'deja_supprime', 'restaure' / 'pas_supprime'.
-- =============================================================================

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS supprime_le timestamptz,
  ADD COLUMN IF NOT EXISTS supprime_par text;

CREATE INDEX IF NOT EXISTS video_jobs_corbeille_idx
  ON public.video_jobs (supprime_le DESC) WHERE supprime_le IS NOT NULL;

-- Un montage créé depuis le hub naît hors de la corbeille
CREATE OR REPLACE FUNCTION public.video_jobs_garde_corbeille()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.supprime_le  := NULL;
    NEW.supprime_par := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_jobs_corbeille ON public.video_jobs;
CREATE TRIGGER video_jobs_corbeille
  BEFORE INSERT ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.video_jobs_garde_corbeille();

-- Tâches et clips du hub : refusés sur un montage dans la corbeille.
-- FOR SHARE attend une suppression en cours et relit la ligne à jour.
CREATE OR REPLACE FUNCTION public.video_refuse_si_corbeille()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() AND NEW.job_id IS NOT NULL THEN
    PERFORM 1 FROM public.video_jobs
      WHERE id = NEW.job_id AND supprime_le IS NOT NULL FOR SHARE;
    IF FOUND THEN
      RAISE EXCEPTION 'Ce montage est dans la corbeille : restaure-le d''abord';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_taches_corbeille ON public.video_taches;
CREATE TRIGGER video_taches_corbeille
  BEFORE INSERT ON public.video_taches
  FOR EACH ROW EXECUTE FUNCTION public.video_refuse_si_corbeille();

DROP TRIGGER IF EXISTS video_clips_corbeille ON public.video_clips;
CREATE TRIGGER video_clips_corbeille
  BEFORE INSERT ON public.video_clips
  FOR EACH ROW EXECUTE FUNCTION public.video_refuse_si_corbeille();

CREATE OR REPLACE FUNCTION public.video_supprimer_montage(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.video_jobs%ROWTYPE;
BEGIN
  IF NOT public.has_montage_access() THEN
    RAISE EXCEPTION 'Accès refusé au module Montage vidéo';
  END IF;

  -- Verrou de ligne : une tâche ou un clip ajouté en même temps attend.
  SELECT * INTO v_job FROM public.video_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montage introuvable';
  END IF;
  IF v_job.supprime_le IS NOT NULL THEN
    RETURN 'deja_supprime';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.video_taches
     WHERE job_id = p_id AND statut IN ('en_attente','en_cours')
  ) THEN
    RAISE EXCEPTION 'Annule d''abord la demande en cours';
  END IF;

  UPDATE public.video_jobs
     SET supprime_le = now(), supprime_par = COALESCE(auth.jwt() ->> 'email', '')
   WHERE id = p_id;
  RETURN 'supprime';
END;
$$;

CREATE OR REPLACE FUNCTION public.video_restaurer_montage(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.video_jobs%ROWTYPE;
BEGIN
  IF NOT public.has_montage_access() THEN
    RAISE EXCEPTION 'Accès refusé au module Montage vidéo';
  END IF;

  SELECT * INTO v_job FROM public.video_jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montage introuvable';
  END IF;
  IF v_job.supprime_le IS NULL THEN
    RETURN 'pas_supprime';
  END IF;

  UPDATE public.video_jobs SET supprime_le = NULL, supprime_par = NULL WHERE id = p_id;
  RETURN 'restaure';
END;
$$;

REVOKE ALL ON FUNCTION public.video_supprimer_montage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.video_supprimer_montage(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.video_restaurer_montage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.video_restaurer_montage(uuid) TO authenticated;
