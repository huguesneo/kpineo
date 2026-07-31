-- ── Segmentation des scores par fenêtre de mesure ───────────────
--
-- Les 40 publications du backfill n'auront jamais de snapshot d7 : elles
-- avaient déjà dépassé 180 h au premier sync et sont passées directement
-- en d28. Les nouvelles publications, elles, auront d7 puis d28.
--
-- Un score d7 et un score d28 ne sont pas comparables : la baseline, le
-- bucket et l'univers de calcul diffèrent. On les stocke donc côte à côte
-- sur deux lignes distinctes plutôt que de les écraser l'un l'autre.

ALTER TABLE public.social_post_scores DROP CONSTRAINT social_post_scores_pkey;

-- Les lignes existantes viennent toutes du run d7 (seule fenêtre calculée
-- jusqu'ici) — on les qualifie avant de poser la contrainte NOT NULL.
ALTER TABLE public.social_post_scores ADD COLUMN window_tag text;
UPDATE public.social_post_scores SET window_tag = 'd7' WHERE window_tag IS NULL;

ALTER TABLE public.social_post_scores
  ALTER COLUMN window_tag SET NOT NULL,
  ADD CONSTRAINT social_post_scores_window_tag_check
    CHECK (window_tag IN ('d7','d28'));

ALTER TABLE public.social_post_scores
  ADD PRIMARY KEY (publication_id, window_tag);
