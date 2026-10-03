-- =============================================================================
-- Module Montage vidéo : colonne video_templates.style_enregistre
-- =============================================================================
-- Additive, se rejoue sans erreur. Ne modifie aucune fonction ni aucun trigger
-- existant.
--
-- style_enregistre = le style du template existe dans video-neo (branche
-- style/<nom> et son skill) : un montage peut en partir. L'agent vidéo le passe
-- à true après « enregistrer le style » ; les templates de départ (styles déjà
-- validés, 20261003b) naissent à true. Seul l'agent (service_role) ou une
-- migration le modifie, jamais un utilisateur du hub.
-- =============================================================================

ALTER TABLE public.video_templates
  ADD COLUMN IF NOT EXISTS style_enregistre boolean NOT NULL DEFAULT false;

-- Un template déjà enregistré par l'agent avant cette colonne l'est toujours
UPDATE public.video_templates
   SET style_enregistre = true
 WHERE reference_video_neo IS NOT NULL AND NOT style_enregistre;

CREATE OR REPLACE FUNCTION public.video_templates_garde_style_enregistre()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.style_enregistre := false;
    ELSIF NEW.style_enregistre IS DISTINCT FROM OLD.style_enregistre THEN
      RAISE EXCEPTION 'style_enregistre est rempli par l''agent vidéo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_templates_style_enregistre ON public.video_templates;
CREATE TRIGGER video_templates_style_enregistre
  BEFORE INSERT OR UPDATE ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.video_templates_garde_style_enregistre();
