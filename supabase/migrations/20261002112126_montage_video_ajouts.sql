-- =============================================================================
-- Module Montage vidéo, phase 1b : ajouts pour l'agent vidéo
-- Additive seulement, se rejoue sans erreur. Suppose 20261002112114_montage_video.sql.
--   video_jobs     : session_id (session Claude, gérée par l'agent),
--                    nom_source (nom du fichier dans NEO vidéo/Brut),
--                    format ('9:16' par défaut, '4:5' ou '1:1' pour une variante)
--   video_versions : sous_titres (mots de la ronde, pour la bande éditable du hub)
--   video_templates: job_id + numero_version (montage d'où vient la proposition)
--   video_config   : réglages du module (ex. id du dossier Brut choisi dans le
--                    Picker). Lecture : module ; écriture : Hugues seulement.
-- =============================================================================

ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS nom_source text;
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT '9:16';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_jobs_format_valide') THEN
    ALTER TABLE public.video_jobs
      ADD CONSTRAINT video_jobs_format_valide CHECK (format IN ('9:16', '4:5', '1:1'));
  END IF;
END;
$$;

ALTER TABLE public.video_versions ADD COLUMN IF NOT EXISTS sous_titres jsonb;

ALTER TABLE public.video_templates
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.video_jobs(id) ON DELETE SET NULL;
ALTER TABLE public.video_templates ADD COLUMN IF NOT EXISTS numero_version integer;

-- Montages : session_id appartient à l'agent, comme les autres colonnes qu'il gère.
-- (Reprend 20261002112114, avec session_id en plus.)
CREATE OR REPLACE FUNCTION public.video_jobs_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.cree_par          := COALESCE(auth.jwt() ->> 'email', '');
    NEW.statut            := 'en_file';
    NEW.position_file     := NULL;
    NEW.version_courante  := 0;
    NEW.branche_git       := NULL;
    NEW.progression       := 0;
    NEW.etape             := NULL;
    NEW.lien_drive_export := NULL;
    NEW.erreur            := NULL;
    NEW.session_id        := NULL;
  END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.video_templates
    WHERE id = NEW.template_id AND statut = 'approuve'
  ) THEN
    RAISE EXCEPTION 'Le template choisi n''est pas approuvé';
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Réglages du module
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_config (
  cle text PRIMARY KEY,
  valeur jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS video_config_touch ON public.video_config;
CREATE TRIGGER video_config_touch
  BEFORE UPDATE ON public.video_config
  FOR EACH ROW EXECUTE FUNCTION public.video_touch_updated_at();

ALTER TABLE public.video_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_config_select ON public.video_config;
CREATE POLICY video_config_select ON public.video_config
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_config_insert ON public.video_config;
CREATE POLICY video_config_insert ON public.video_config
  FOR INSERT WITH CHECK (public.is_hugues());

DROP POLICY IF EXISTS video_config_update ON public.video_config;
CREATE POLICY video_config_update ON public.video_config
  FOR UPDATE USING (public.is_hugues()) WITH CHECK (public.is_hugues());

DROP POLICY IF EXISTS video_config_delete ON public.video_config;
CREATE POLICY video_config_delete ON public.video_config
  FOR DELETE USING (public.is_hugues());
