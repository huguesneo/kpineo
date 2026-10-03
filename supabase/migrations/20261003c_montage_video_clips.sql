-- =============================================================================
-- Module Montage vidéo : plusieurs clips par montage (principal et b-roll)
-- =============================================================================
-- Additive, se rejoue sans erreur. Ne modifie aucune fonction, aucun trigger ni
-- aucune colonne existante.
--
-- video_clips : les vidéos d'un montage, dans l'ordre choisi dans le hub.
--   role 'principal' = vidéo parlée, 'broll' = images d'appoint.
--   Source : la même que video_jobs (fichier_drive_id + nom_source, le nom du
--   fichier dans NEO vidéo/Brut).
--   duree_s : rempli plus tard par l'agent (service_role).
-- video_jobs.fichier_drive_id et nom_source restent remplis avec le premier clip
-- principal : l'agent actuel ne lit que ceux-là.
-- Hub : lecture, et écriture des clips au lancement seulement (montage encore
-- sans version). Pas de modification ni de suppression depuis le hub.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.video_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  ordre integer NOT NULL CHECK (ordre BETWEEN 1 AND 10),   -- 10 clips au plus
  role text NOT NULL DEFAULT 'broll' CHECK (role IN ('principal','broll')),
  nom text NOT NULL CHECK (length(btrim(nom)) > 0),
  fichier_drive_id text,
  nom_source text,
  duree_s numeric CHECK (duree_s IS NULL OR duree_s >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_clips_ordre_unique UNIQUE (job_id, ordre)
);

-- Clips : le hub n'en ajoute qu'à un montage qui n'a pas encore de version
-- (au lancement). L'agent et les migrations ne sont pas concernés.
CREATE OR REPLACE FUNCTION public.video_clips_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    NEW.duree_s := NULL;
    IF NOT EXISTS (
      SELECT 1 FROM public.video_jobs WHERE id = NEW.job_id AND version_courante = 0
    ) THEN
      RAISE EXCEPTION 'Les clips se choisissent au lancement du montage';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_clips_insert ON public.video_clips;
CREATE TRIGGER video_clips_insert
  BEFORE INSERT ON public.video_clips
  FOR EACH ROW EXECUTE FUNCTION public.video_clips_avant_insert();

ALTER TABLE public.video_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_clips_select ON public.video_clips;
CREATE POLICY video_clips_select ON public.video_clips
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_clips_insert ON public.video_clips;
CREATE POLICY video_clips_insert ON public.video_clips
  FOR INSERT WITH CHECK (public.has_montage_access());

-- Backfill : chaque montage existant reçoit son clip 1, principal, copié de sa
-- source actuelle. Rejoué : rien de plus (ordre 1 déjà pris).
INSERT INTO public.video_clips (job_id, ordre, role, nom, fichier_drive_id, nom_source)
SELECT j.id, 1, 'principal', COALESCE(NULLIF(btrim(j.nom_source), ''), NULLIF(btrim(j.titre), ''), 'Clip 1'), j.fichier_drive_id, j.nom_source
  FROM public.video_jobs j
ON CONFLICT (job_id, ordre) DO NOTHING;
