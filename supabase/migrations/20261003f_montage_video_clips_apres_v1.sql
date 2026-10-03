-- =============================================================================
-- Module Montage vidéo : ajouter ou remplacer un clip après la v1
-- =============================================================================
-- Additive, se rejoue sans erreur. Deux colonnes ajoutées à video_clips ; la
-- fonction du trigger d'insertion (20261003c) est réécrite, le trigger lui-même
-- ne change pas. Aucune donnée existante n'est touchée.
--
--   remplace_ordre     : sur le NOUVEAU clip, l'ordre du clip qu'il remplace
--                        (même montage). L'ancien clip n'est jamais modifié ni
--                        supprimé : « remplacé » se déduit de cette colonne.
--                        Un ordre et pas un id : l'agent recopie toutes les
--                        colonnes (sauf id) dans une variante, où l'ordre reste
--                        juste.
--   ajoute_en_version  : version actuelle du montage au moment de l'ajout
--                        (vide pour les clips choisis au lancement).
--
-- Hub, montage sans version : comme avant (lancement).
-- Hub, montage qui a une version :
--   - refusé pendant un rendu final (statut « rendu » ou tâche « terminer »
--     qui attend ou tourne) ; un montage terminé accepte l'ajout ;
--   - ordre donné par la base (le suivant), 10 clips au plus, clips remplacés
--     compris ;
--   - remplace_ordre : un clip de ce montage, pas déjà remplacé ;
--   - il reste au moins un clip Principal non remplacé.
-- L'agent (service_role) et les migrations ne sont pas concernés.
-- Toujours ni modification ni suppression depuis le hub (aucune politique).
-- =============================================================================

ALTER TABLE public.video_clips
  ADD COLUMN IF NOT EXISTS remplace_ordre integer CHECK (remplace_ordre BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS ajoute_en_version integer CHECK (ajoute_en_version >= 1);

CREATE OR REPLACE FUNCTION public.video_clips_avant_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_version integer;
  v_statut text;
  v_cible public.video_clips%ROWTYPE;
BEGIN
  IF NOT public.video_est_utilisateur_hub() THEN
    RETURN NEW;
  END IF;

  NEW.duree_s := NULL;
  SELECT version_courante, statut INTO v_version, v_statut
    FROM public.video_jobs WHERE id = NEW.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Montage introuvable';
  END IF;

  -- Lancement : les clips choisis à l'étape 1
  IF v_version = 0 THEN
    NEW.remplace_ordre := NULL;
    NEW.ajoute_en_version := NULL;
    RETURN NEW;
  END IF;

  -- Après la v1
  IF v_statut = 'rendu' OR EXISTS (
    SELECT 1 FROM public.video_taches
     WHERE job_id = NEW.job_id AND type = 'terminer' AND statut IN ('en_attente','en_cours')
  ) THEN
    RAISE EXCEPTION 'Un rendu final est en cours : attends la fin pour ajouter ou remplacer un clip';
  END IF;

  SELECT COALESCE(max(ordre), 0) + 1 INTO NEW.ordre
    FROM public.video_clips WHERE job_id = NEW.job_id;
  IF NEW.ordre > 10 THEN
    RAISE EXCEPTION '10 clips au plus par montage (clips remplacés compris)';
  END IF;
  NEW.ajoute_en_version := v_version;

  IF NEW.remplace_ordre IS NOT NULL THEN
    SELECT * INTO v_cible FROM public.video_clips
     WHERE job_id = NEW.job_id AND ordre = NEW.remplace_ordre;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Le clip % n''existe pas dans ce montage', NEW.remplace_ordre;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.video_clips WHERE job_id = NEW.job_id AND remplace_ordre = NEW.remplace_ordre
    ) THEN
      RAISE EXCEPTION 'Le clip % est déjà remplacé', NEW.remplace_ordre;
    END IF;
  END IF;

  -- Au moins un Principal non remplacé après cet ajout
  IF NEW.role <> 'principal' AND NOT EXISTS (
    SELECT 1 FROM public.video_clips c
     WHERE c.job_id = NEW.job_id AND c.role = 'principal'
       AND c.ordre IS DISTINCT FROM NEW.remplace_ordre
       AND NOT EXISTS (SELECT 1 FROM public.video_clips r WHERE r.job_id = c.job_id AND r.remplace_ordre = c.ordre)
  ) THEN
    RAISE EXCEPTION 'Il faut garder au moins un clip Principal';
  END IF;

  RETURN NEW;
END;
$$;
