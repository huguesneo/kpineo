-- =============================================================================
-- Module Montage vidéo, étape 10a : templates proposés, refus motivé, archivage
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger existant
-- modifié ; le CHECK du statut est seulement élargi (aucune ligne ne change).
--
--   video_templates.description : courte description écrite à la proposition
--   video_templates.motif_refus : motif court (facultatif) d'un refus, Hugues seulement
--   statut 'archive'            : template approuvé retiré de la galerie par
--                                 Hugues ; les montages qui l'ont utilisé restent
--                                 (template_id inchangé), aucun nouveau montage
--                                 ne peut en partir (video_jobs_avant_insert
--                                 exige 'approuve').
--
-- Passages de statut permis depuis le hub (en plus de « seul Hugues change le
-- statut », déjà garanti par video_templates_avant_update) :
--   propose → approuve | refuse,  approuve → archive,  archive → approuve.
-- approuve_par / approuve_le gardent « qui a tranché en dernier, et quand ».
-- =============================================================================

ALTER TABLE public.video_templates ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.video_templates ADD COLUMN IF NOT EXISTS motif_refus text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_templates_statut_check'
      AND conrelid = 'public.video_templates'::regclass
      AND pg_get_constraintdef(oid) LIKE '%archive%'
  ) THEN
    ALTER TABLE public.video_templates DROP CONSTRAINT IF EXISTS video_templates_statut_check;
    ALTER TABLE public.video_templates
      ADD CONSTRAINT video_templates_statut_check
      CHECK (statut IN ('propose', 'approuve', 'refuse', 'archive'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.video_templates_garde_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.motif_refus := NULL;
    ELSE
      IF NEW.motif_refus IS DISTINCT FROM OLD.motif_refus AND NOT public.is_hugues() THEN
        RAISE EXCEPTION 'Seul Hugues écrit le motif d''un refus';
      END IF;
      IF NEW.statut IS DISTINCT FROM OLD.statut AND NOT (
           (OLD.statut = 'propose'  AND NEW.statut IN ('approuve', 'refuse'))
        OR (OLD.statut = 'approuve' AND NEW.statut = 'archive')
        OR (OLD.statut = 'archive'  AND NEW.statut = 'approuve')
      ) THEN
        RAISE EXCEPTION 'Passage de statut non permis : % → %', OLD.statut, NEW.statut;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_templates_decision ON public.video_templates;
CREATE TRIGGER video_templates_decision
  BEFORE INSERT OR UPDATE ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.video_templates_garde_decision();
