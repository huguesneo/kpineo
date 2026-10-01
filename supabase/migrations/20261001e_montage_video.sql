-- =============================================================================
-- Module Montage vidéo — phase 1a : tables, RLS, bucket des aperçus
-- Accès au module : liste de has_montage_access() (miroir JS :
-- src/lib/montageVideoAccess.js). Approbation des templates : Hugues seulement
-- (public.is_hugues(), définie dans 20260609_performance_reer.sql).
-- L'agent vidéo (Mac de Hugues) écrit avec la clé service_role, qui contourne
-- le RLS. Les colonnes qu'il gère sont protégées par des triggers contre les
-- écritures des utilisateurs du hub.
-- =============================================================================

-- L'utilisateur courant a-t-il accès au module Montage vidéo ?
CREATE OR REPLACE FUNCTION public.has_montage_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') IN (
    'hugues@neoperformance.ca',
    'info@neoperformance.ca'
  );
$$;

-- Vrai pour les appels du hub (rôles anon/authenticated). Faux pour l'agent
-- (service_role) et pour les migrations / l'éditeur SQL (postgres).
CREATE OR REPLACE FUNCTION public.video_est_utilisateur_hub()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT current_user IN ('anon', 'authenticated');
$$;

-- updated_at automatique (partagé par les tables du module)
CREATE OR REPLACE FUNCTION public.video_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Templates (propositions, puis approuvés ou refusés par Hugues)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  type_video text NOT NULL,                 -- nom du skill dans video-neo
  reference_video_neo text,                 -- où le style est enregistré (rempli par l'agent)
  chemin_apercu text,                       -- templates/<id>/apercu.mp4 dans video-apercus
  statut text NOT NULL DEFAULT 'propose'
    CHECK (statut IN ('propose','approuve','refuse')),
  propose_par text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', ''),
  approuve_par text,                        -- qui a tranché (approuvé ou refusé)
  approuve_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_templates_statut_idx ON public.video_templates (statut);

-- -----------------------------------------------------------------------------
-- Montages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  cree_par text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', ''),
  fichier_drive_id text,
  -- RESTRICT : un template utilisé ne peut pas disparaître sous un montage
  template_id uuid REFERENCES public.video_templates(id) ON DELETE RESTRICT,
  prompt text,
  statut text NOT NULL DEFAULT 'en_file'
    CHECK (statut IN ('en_file','transcription','montage','apercu_pret','rendu','termine','erreur')),
  position_file integer,
  version_courante integer NOT NULL DEFAULT 0,
  branche_git text,
  progression integer NOT NULL DEFAULT 0 CHECK (progression BETWEEN 0 AND 100),
  etape text,
  lien_drive_export text,
  erreur text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Prompt obligatoire sans template
  CONSTRAINT video_jobs_template_ou_prompt
    CHECK (template_id IS NOT NULL OR length(btrim(COALESCE(prompt, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS video_jobs_file_idx    ON public.video_jobs (statut, created_at);
CREATE INDEX IF NOT EXISTS video_jobs_created_idx ON public.video_jobs (created_at DESC);

-- -----------------------------------------------------------------------------
-- Versions (une par ronde, écrites par l'agent après son commit git)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero >= 1),
  commit_git text,
  chemin_apercu text,                       -- apercus/<job_id>/v<n>.mp4 dans video-apercus
  prompt text,
  reponse_agent text,
  auteur text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, numero)
);

-- -----------------------------------------------------------------------------
-- Tâches envoyées à l'agent (montage, corrections, restauration, export...)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_taches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('montage','correction_sous_titres','restaurer','terminer','variante','enregistrer_style')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','en_cours','fait','erreur')),
  cree_par text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', ''),
  erreur text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Seule enregistrer_style vit sans montage ; elle doit nommer son template
  CONSTRAINT video_taches_job_requis
    CHECK (job_id IS NOT NULL OR type = 'enregistrer_style'),
  CONSTRAINT video_taches_template_requis
    CHECK (type <> 'enregistrer_style' OR payload ? 'template_id')
);

CREATE INDEX IF NOT EXISTS video_taches_file_idx ON public.video_taches (statut, created_at);
CREATE INDEX IF NOT EXISTS video_taches_job_idx  ON public.video_taches (job_id);

-- Une seule tâche à la fois sur le Mac
CREATE UNIQUE INDEX IF NOT EXISTS video_taches_une_en_cours
  ON public.video_taches ((true)) WHERE statut = 'en_cours';

-- -----------------------------------------------------------------------------
-- État de l'agent (une seule ligne, heartbeat toutes les 30 s)
-- Hors ligne = now() - dernier_signal > 90 s, calculé dans le hub.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_agent_status (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dernier_signal timestamptz,
  tache_en_cours uuid REFERENCES public.video_taches(id) ON DELETE SET NULL,
  version_agent text
);

INSERT INTO public.video_agent_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Triggers de protection (les colonnes de l'agent et l'approbation)
-- -----------------------------------------------------------------------------

-- Templates : une proposition naît « propose », au nom de qui la crée
CREATE OR REPLACE FUNCTION public.video_templates_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.statut              := 'propose';
    NEW.propose_par         := COALESCE(auth.jwt() ->> 'email', '');
    NEW.approuve_par        := NULL;
    NEW.approuve_le         := NULL;
    NEW.reference_video_neo := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Templates : seul Hugues tranche ; l'agent seul remplit reference_video_neo
CREATE OR REPLACE FUNCTION public.video_templates_avant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    IF NEW.statut IS DISTINCT FROM OLD.statut THEN
      IF NOT public.is_hugues() THEN
        RAISE EXCEPTION 'Seul Hugues peut approuver ou refuser un template';
      END IF;
      NEW.approuve_par := auth.jwt() ->> 'email';
      NEW.approuve_le  := now();
    ELSIF NEW.approuve_par IS DISTINCT FROM OLD.approuve_par
       OR NEW.approuve_le  IS DISTINCT FROM OLD.approuve_le THEN
      RAISE EXCEPTION 'approuve_par et approuve_le sont remplis automatiquement';
    END IF;
    IF NEW.propose_par IS DISTINCT FROM OLD.propose_par THEN
      RAISE EXCEPTION 'propose_par ne peut pas être modifié';
    END IF;
    IF NEW.reference_video_neo IS DISTINCT FROM OLD.reference_video_neo THEN
      RAISE EXCEPTION 'reference_video_neo est rempli par l''agent vidéo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Templates : à l'approbation, la tâche « enregistrer le style » part vers l'agent
CREATE OR REPLACE FUNCTION public.video_templates_apres_approbation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.video_taches (type, payload, cree_par)
  VALUES ('enregistrer_style',
          jsonb_build_object('template_id', NEW.id),
          COALESCE(NEW.approuve_par, auth.jwt() ->> 'email', ''));
  RETURN NULL;
END;
$$;

-- Montages : un nouveau montage entre dans la file, au nom de qui le crée,
-- et seulement avec un template approuvé
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

-- Montages : le hub ne peut changer que le titre ; le reste passe par une tâche
CREATE OR REPLACE FUNCTION public.video_jobs_avant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub()
     AND (to_jsonb(NEW) - 'titre' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'titre' - 'updated_at') THEN
    RAISE EXCEPTION 'Seul le titre d''un montage se modifie depuis le hub';
  END IF;
  RETURN NEW;
END;
$$;

-- Tâches : une tâche du hub naît « en_attente », au nom de qui la crée
CREATE OR REPLACE FUNCTION public.video_taches_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.statut   := 'en_attente';
    NEW.cree_par := COALESCE(auth.jwt() ->> 'email', '');
    NEW.erreur   := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_templates_insert ON public.video_templates;
CREATE TRIGGER video_templates_insert
  BEFORE INSERT ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.video_templates_avant_insert();

DROP TRIGGER IF EXISTS video_templates_update ON public.video_templates;
CREATE TRIGGER video_templates_update
  BEFORE UPDATE ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.video_templates_avant_update();

DROP TRIGGER IF EXISTS video_templates_touch ON public.video_templates;
CREATE TRIGGER video_templates_touch
  BEFORE UPDATE ON public.video_templates
  FOR EACH ROW EXECUTE FUNCTION public.video_touch_updated_at();

DROP TRIGGER IF EXISTS video_templates_approuve ON public.video_templates;
CREATE TRIGGER video_templates_approuve
  AFTER UPDATE OF statut ON public.video_templates
  FOR EACH ROW
  WHEN (NEW.statut = 'approuve' AND OLD.statut IS DISTINCT FROM 'approuve')
  EXECUTE FUNCTION public.video_templates_apres_approbation();

DROP TRIGGER IF EXISTS video_jobs_insert ON public.video_jobs;
CREATE TRIGGER video_jobs_insert
  BEFORE INSERT ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.video_jobs_avant_insert();

DROP TRIGGER IF EXISTS video_jobs_update ON public.video_jobs;
CREATE TRIGGER video_jobs_update
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.video_jobs_avant_update();

DROP TRIGGER IF EXISTS video_jobs_touch ON public.video_jobs;
CREATE TRIGGER video_jobs_touch
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.video_touch_updated_at();

DROP TRIGGER IF EXISTS video_taches_insert ON public.video_taches;
CREATE TRIGGER video_taches_insert
  BEFORE INSERT ON public.video_taches
  FOR EACH ROW EXECUTE FUNCTION public.video_taches_avant_insert();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.video_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_taches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_agent_status ENABLE ROW LEVEL SECURITY;

-- Templates
DROP POLICY IF EXISTS video_templates_select ON public.video_templates;
CREATE POLICY video_templates_select ON public.video_templates
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_templates_insert ON public.video_templates;
CREATE POLICY video_templates_insert ON public.video_templates
  FOR INSERT WITH CHECK (public.has_montage_access());

-- Hugues sur tout ; les autres sur leurs propres propositions encore ouvertes
DROP POLICY IF EXISTS video_templates_update ON public.video_templates;
CREATE POLICY video_templates_update ON public.video_templates
  FOR UPDATE
  USING (public.has_montage_access() AND (
    public.is_hugues()
    OR (propose_par = auth.jwt() ->> 'email' AND statut = 'propose')))
  WITH CHECK (public.has_montage_access());

DROP POLICY IF EXISTS video_templates_delete ON public.video_templates;
CREATE POLICY video_templates_delete ON public.video_templates
  FOR DELETE
  USING (public.has_montage_access() AND (
    public.is_hugues()
    OR (propose_par = auth.jwt() ->> 'email' AND statut = 'propose')));

-- Montages : lecture, création, titre. Pas de suppression depuis le hub.
DROP POLICY IF EXISTS video_jobs_select ON public.video_jobs;
CREATE POLICY video_jobs_select ON public.video_jobs
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_jobs_insert ON public.video_jobs;
CREATE POLICY video_jobs_insert ON public.video_jobs
  FOR INSERT WITH CHECK (public.has_montage_access());

DROP POLICY IF EXISTS video_jobs_update ON public.video_jobs;
CREATE POLICY video_jobs_update ON public.video_jobs
  FOR UPDATE USING (public.has_montage_access()) WITH CHECK (public.has_montage_access());

-- Versions : lecture seulement (l'agent écrit en service_role)
DROP POLICY IF EXISTS video_versions_select ON public.video_versions;
CREATE POLICY video_versions_select ON public.video_versions
  FOR SELECT USING (public.has_montage_access());

-- Tâches : lecture et création ; enregistrer_style réservé à Hugues
DROP POLICY IF EXISTS video_taches_select ON public.video_taches;
CREATE POLICY video_taches_select ON public.video_taches
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_taches_insert ON public.video_taches;
CREATE POLICY video_taches_insert ON public.video_taches
  FOR INSERT WITH CHECK (
    public.has_montage_access()
    AND (type <> 'enregistrer_style' OR public.is_hugues()));

-- État de l'agent : lecture seulement
DROP POLICY IF EXISTS video_agent_status_select ON public.video_agent_status;
CREATE POLICY video_agent_status_select ON public.video_agent_status
  FOR SELECT USING (public.has_montage_access());

-- -----------------------------------------------------------------------------
-- Temps réel
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['video_jobs','video_versions','video_taches','video_templates','video_agent_status'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Bucket privé des aperçus
--   apercus/<job_id>/v<n>.mp4  et  templates/<template_id>/apercu.mp4
-- Lecture par URL signée pour le module ; écriture par l'agent seulement.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-apercus', 'video-apercus', false, 524288000, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS video_apercus_read ON storage.objects;
CREATE POLICY video_apercus_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-apercus'
    AND public.has_montage_access()
    AND (storage.foldername(name))[1] IN ('apercus', 'templates'));
