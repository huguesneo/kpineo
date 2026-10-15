-- =============================================================================
-- Module Montage vidéo : timeline du hub (mise en production du labo, étape 1)
-- =============================================================================
-- Additive, se rejoue sans erreur. Rien n'est supprimé ni renommé.
-- Seul objet existant touché : la contrainte video_taches_type_check, remplacée
-- par la même liste + 2 types (elle n'accepte que plus de valeurs ; OK de Hugues
-- du 15 oct. 2026). Retour en arrière : supabase/retours/20261015a_montage_video_timeline_retour.sql
--
-- L'agent vidéo (Mac de Hugues, clé service_role) prépare ce que la timeline
-- affiche ; le rendu final reste fait sur le Mac depuis les originaux 4K.
--   video_timeline           : recette de la version courante, ressources
--                              téléversées, brouillon de la timeline (écrit par le hub)
--   video_timeline_requetes  : vérifications courtes (placement, problèmes,
--                              PNG d'une carte), traitées à côté de la file
--   bucket video-timeline    : privé ; copie légère 720 × 1280, cartes, formes
--                              d'onde, bibliothèque de sons. Lecture par URL
--                              signée (15 min) pour hugues@ et info@ seulement.
-- Vidéos « Une cliente » : timeline FERMÉE (décision du 15 oct. 2026) : aucune
-- copie de vidéo de cliente dans le stockage ; refus dans la base et dans l'agent.

-- -----------------------------------------------------------------------------
-- 1. Deux types de tâche de plus
-- -----------------------------------------------------------------------------
ALTER TABLE public.video_taches DROP CONSTRAINT IF EXISTS video_taches_type_check;
ALTER TABLE public.video_taches ADD CONSTRAINT video_taches_type_check
  CHECK (type IN ('montage','correction_sous_titres','restaurer','terminer','variante','enregistrer_style',
                  'timeline_preparer','timeline_appliquer'));

-- Montage d'une cliente : rien pour la timeline (préparer, appliquer)
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

-- -----------------------------------------------------------------------------
-- 2. Timeline d'un montage (une ligne, créée par l'agent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_timeline (
  job_id uuid PRIMARY KEY REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  numero_version integer,                        -- version dont vient la recette
  recette jsonb,                                 -- recette du moteur (agent)
  ressources jsonb NOT NULL DEFAULT '{}'::jsonb, -- chemins du bucket video-timeline (agent) ; {} = effacées
  ressources_le timestamptz,
  brouillon jsonb,                               -- recette en cours d'édition (hub)
  brouillon_le timestamptz,
  brouillon_par text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Le hub n'écrit que le brouillon ; qui et quand sont remplis par la base
CREATE OR REPLACE FUNCTION public.video_timeline_avant_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.video_est_utilisateur_hub() THEN
    IF (to_jsonb(NEW) - 'brouillon' - 'brouillon_le' - 'brouillon_par' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'brouillon' - 'brouillon_le' - 'brouillon_par' - 'updated_at') THEN
      RAISE EXCEPTION 'Seul le brouillon de la timeline se modifie depuis le hub';
    END IF;
    IF NEW.brouillon IS NOT NULL AND octet_length(NEW.brouillon::text) > 1000000 THEN
      RAISE EXCEPTION 'Brouillon trop gros (1 Mo au plus)';
    END IF;
    NEW.brouillon_le  := now();
    NEW.brouillon_par := COALESCE(auth.jwt() ->> 'email', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_timeline_update ON public.video_timeline;
CREATE TRIGGER video_timeline_update
  BEFORE UPDATE ON public.video_timeline
  FOR EACH ROW EXECUTE FUNCTION public.video_timeline_avant_update();

DROP TRIGGER IF EXISTS video_timeline_touch ON public.video_timeline;
CREATE TRIGGER video_timeline_touch
  BEFORE UPDATE ON public.video_timeline
  FOR EACH ROW EXECUTE FUNCTION public.video_touch_updated_at();

ALTER TABLE public.video_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_timeline_select ON public.video_timeline;
CREATE POLICY video_timeline_select ON public.video_timeline
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_timeline_update ON public.video_timeline;
CREATE POLICY video_timeline_update ON public.video_timeline
  FOR UPDATE USING (public.has_montage_access()) WITH CHECK (public.has_montage_access());
-- Aucune règle INSERT ni DELETE : l'agent seul crée la ligne ; elle part avec le montage.

-- -----------------------------------------------------------------------------
-- 3. Vérifications courtes de la timeline (à côté de la file des tâches)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_timeline_requetes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('verifier','carte')),
  recette jsonb NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','fait','erreur')),
  reponse jsonb,
  erreur text,
  cree_par text NOT NULL DEFAULT COALESCE(auth.jwt() ->> 'email', ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  traitee_le timestamptz
);

CREATE INDEX IF NOT EXISTS video_timeline_requetes_file_idx ON public.video_timeline_requetes (statut, created_at);
CREATE INDEX IF NOT EXISTS video_timeline_requetes_job_idx ON public.video_timeline_requetes (job_id);

-- Une demande du hub naît « en_attente », à son nom ; jamais pour une cliente
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

DROP TRIGGER IF EXISTS video_timeline_requetes_insert ON public.video_timeline_requetes;
CREATE TRIGGER video_timeline_requetes_insert
  BEFORE INSERT ON public.video_timeline_requetes
  FOR EACH ROW EXECUTE FUNCTION public.video_timeline_requetes_avant_insert();

ALTER TABLE public.video_timeline_requetes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_timeline_requetes_select ON public.video_timeline_requetes;
CREATE POLICY video_timeline_requetes_select ON public.video_timeline_requetes
  FOR SELECT USING (public.has_montage_access());

DROP POLICY IF EXISTS video_timeline_requetes_insert ON public.video_timeline_requetes;
CREATE POLICY video_timeline_requetes_insert ON public.video_timeline_requetes
  FOR INSERT WITH CHECK (public.has_montage_access());
-- Réponse écrite par l'agent seulement (aucune règle UPDATE ni DELETE pour le hub).

-- -----------------------------------------------------------------------------
-- 4. Temps réel
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['video_timeline','video_timeline_requetes'] LOOP
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
-- 5. Bucket privé de la timeline
--   montages/<job_id>/proxy-<empreinte>.mp4, montages/<job_id>/cartes/<empreinte>.png,
--   montages/<job_id>/ondes/<empreinte>.json, sons/<catégorie>/<fichier>, sons/index.json
-- Lecture par URL signée pour le module ; écriture par l'agent seulement.
-- Copies d'un montage effacées par l'agent après Terminer, et au plus tard 7 jours
-- après sa dernière modification ; les sons restent.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-timeline', 'video-timeline', false, 524288000,
        ARRAY['video/mp4','image/png','application/json','audio/mpeg','audio/wav','audio/x-wav','audio/mp4',
              'audio/aac','audio/ogg','audio/flac','audio/aiff','audio/x-aiff'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS video_timeline_read ON storage.objects;
CREATE POLICY video_timeline_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-timeline'
    AND public.has_montage_access()
    AND (storage.foldername(name))[1] IN ('montages', 'sons'));
