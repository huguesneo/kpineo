-- =============================================================================
-- Module Montage vidéo : annuler une tâche (bouton « Annuler » du hub)
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger existant
-- réécrit. Seul changement à l'existant : la contrainte CHECK de
-- video_taches.statut est élargie à 'annulee' (aucune valeur retirée).
--
--   video_taches.annulation_demandee_le / _par : qui a cliqué « Annuler », quand.
--   video_taches.annulee_le                    : quand la tâche est devenue
--                                                'annulee' (par la base ou l'agent).
--
-- Le hub n'a toujours ni UPDATE ni DELETE sur video_taches : il annule par la
-- fonction video_annuler_tache(id) (SECURITY DEFINER), seule porte d'entrée.
--   - tâche en_attente : annulée tout de suite (statut 'annulee'). Si c'est le
--     premier montage (v0) et qu'aucune autre tâche n'attend sur ce montage, le
--     montage passe en erreur « annulé » (le hub propose alors de le relancer).
--     Les positions dans la file sont recalculées (même règle que l'agent).
--   - tâche en_cours : la demande est posée (annulation_demandee_le/_par), le
--     statut reste en_cours. C'est l'agent qui s'arrête proprement, nettoie et
--     écrit 'annulee' (ou finit en 'fait' si la demande arrive trop tard).
--     Un agent qui ne connaît pas encore ces colonnes l'ignore simplement.
--   - tâche finie (fait, erreur, annulee) : rien ne change.
-- Droits : has_montage_access() (hugues@ et info@), sur toutes les tâches ;
-- enregistrer_style : Hugues seulement (comme à la création).
-- Retour : 'annulee', 'demandee', 'deja_demandee' ou 'deja_finie'.
-- =============================================================================

ALTER TABLE public.video_taches
  ADD COLUMN IF NOT EXISTS annulation_demandee_le timestamptz,
  ADD COLUMN IF NOT EXISTS annulation_demandee_par text,
  ADD COLUMN IF NOT EXISTS annulee_le timestamptz;

-- Statut élargi : en_attente, en_cours, fait, erreur, annulee
ALTER TABLE public.video_taches DROP CONSTRAINT IF EXISTS video_taches_statut_check;
ALTER TABLE public.video_taches ADD CONSTRAINT video_taches_statut_check
  CHECK (statut IN ('en_attente','en_cours','fait','erreur','annulee'));

-- Une tâche créée depuis le hub naît sans annulation
CREATE OR REPLACE FUNCTION public.video_taches_garde_annulation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.annulation_demandee_le  := NULL;
    NEW.annulation_demandee_par := NULL;
    NEW.annulee_le              := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_taches_annulation ON public.video_taches;
CREATE TRIGGER video_taches_annulation
  BEFORE INSERT ON public.video_taches
  FOR EACH ROW EXECUTE FUNCTION public.video_taches_garde_annulation();

-- Positions dans la file : 0 = en cours, 1, 2… = en attente, null = rien.
-- Même règle que l'agent (recalculerFile) : le rang compte toutes les tâches
-- en attente, celles sans montage comprises.
CREATE OR REPLACE FUNCTION public.video_recalculer_file()
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  WITH actives AS (
    SELECT job_id, statut, row_number() OVER (PARTITION BY statut ORDER BY created_at, id) AS rang
      FROM video_taches WHERE statut IN ('en_attente','en_cours')
  ), positions AS (
    SELECT job_id, 0 AS position FROM actives WHERE statut = 'en_cours' AND job_id IS NOT NULL
    UNION ALL
    SELECT job_id, min(rang)::int FROM actives
     WHERE statut = 'en_attente' AND job_id IS NOT NULL
       AND job_id NOT IN (SELECT job_id FROM actives WHERE statut = 'en_cours' AND job_id IS NOT NULL)
     GROUP BY job_id
  )
  UPDATE video_jobs j
     SET position_file = p.position
    FROM (SELECT j2.id, pos.position FROM video_jobs j2 LEFT JOIN positions pos ON pos.job_id = j2.id) p
   WHERE j.id = p.id AND j.position_file IS DISTINCT FROM p.position;
$$;

REVOKE ALL ON FUNCTION public.video_recalculer_file() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.video_annuler_tache(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := COALESCE(auth.jwt() ->> 'email', '');
  v_tache public.video_taches%ROWTYPE;
  v_job public.video_jobs%ROWTYPE;
BEGIN
  IF NOT public.has_montage_access() THEN
    RAISE EXCEPTION 'Accès refusé au module Montage vidéo';
  END IF;

  -- Verrou de ligne : l'agent qui prend la tâche (UPDATE … WHERE statut =
  -- 'en_attente') attend, puis ne trouve plus rien à prendre.
  SELECT * INTO v_tache FROM public.video_taches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tâche introuvable';
  END IF;
  IF v_tache.type = 'enregistrer_style' AND NOT public.is_hugues() THEN
    RAISE EXCEPTION 'Seul Hugues peut annuler l''enregistrement d''un style';
  END IF;

  IF v_tache.statut = 'en_attente' THEN
    UPDATE public.video_taches
       SET statut = 'annulee', annulee_le = now(),
           annulation_demandee_le = now(), annulation_demandee_par = v_email
     WHERE id = p_id;

    -- Premier montage annulé avant de commencer : le montage n'a rien, il
    -- passe en erreur pour que le hub propose de le relancer.
    IF v_tache.type = 'montage' AND v_tache.job_id IS NOT NULL THEN
      SELECT * INTO v_job FROM public.video_jobs WHERE id = v_tache.job_id FOR UPDATE;
      IF FOUND AND v_job.version_courante = 0 AND NOT EXISTS (
        SELECT 1 FROM public.video_taches
         WHERE job_id = v_job.id AND statut IN ('en_attente','en_cours')
      ) THEN
        UPDATE public.video_jobs
           SET statut = 'erreur', erreur = 'Montage annulé avant de commencer. Tu peux le relancer.',
               etape = NULL, progression = 0
         WHERE id = v_job.id;
      END IF;
    END IF;

    PERFORM public.video_recalculer_file();
    RETURN 'annulee';
  END IF;

  IF v_tache.statut = 'en_cours' THEN
    IF v_tache.annulation_demandee_le IS NOT NULL THEN
      RETURN 'deja_demandee';
    END IF;
    UPDATE public.video_taches
       SET annulation_demandee_le = now(), annulation_demandee_par = v_email
     WHERE id = p_id;
    RETURN 'demandee';
  END IF;

  RETURN 'deja_finie';
END;
$$;

REVOKE ALL ON FUNCTION public.video_annuler_tache(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.video_annuler_tache(uuid) TO authenticated;
