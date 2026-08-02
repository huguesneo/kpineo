-- ============================================================================
-- Relevés tardifs : rendre scorables Facebook et TikTok
--
-- Les 54 publications Facebook et TikTok importées de Metricool portaient
-- window_tag = null. Le moteur de score ne lit que les relevés étiquetés d7 ou
-- d28 : ces publications lui étaient donc invisibles, définitivement.
--
-- On les étiquette, mais un relevé Metricool pris aujourd'hui sur une
-- publication de mai n'est pas une mesure à J+28 : c'est la valeur cumulée
-- d'aujourd'hui, qui a continué de grimper depuis. La colonne is_late_measure
-- garde cette distinction visible, en base et à l'écran, plutôt que de la
-- laisser se perdre.
-- ============================================================================

ALTER TABLE public.social_metric_snapshots
  ADD COLUMN IF NOT EXISTS is_late_measure boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.social_metric_snapshots.is_late_measure IS
  'Relevé pris nettement après la fenêtre qu''il documente (plus de 30 jours '
  'après publication). La valeur est cumulée depuis la publication, donc '
  'supérieure à ce qu''aurait donné une mesure faite dans la fenêtre.';

-- Étiquetage des relevés Metricool encore sans fenêtre.
-- Le seuil de 648 h est celui de windowTag() dans social-sync-meta : on ne
-- s'invente pas une règle parallèle.
WITH deja_pris AS (
  SELECT publication_id, window_tag
    FROM public.social_metric_snapshots
   WHERE window_tag IS NOT NULL
)
UPDATE public.social_metric_snapshots s
   SET window_tag = CASE
         WHEN s.age_hours >= 648 THEN 'd28'
         WHEN s.age_hours BETWEEN 156 AND 180 THEN 'd7'
       END,
       is_late_measure = s.age_hours > 720
 WHERE s.raw->>'source' = 'metricool'
   AND s.window_tag IS NULL
   AND (s.age_hours >= 648 OR s.age_hours BETWEEN 156 AND 180)
   AND NOT EXISTS (
     SELECT 1 FROM deja_pris d
      WHERE d.publication_id = s.publication_id
        AND d.window_tag = CASE
              WHEN s.age_hours >= 648 THEN 'd28'
              WHEN s.age_hours BETWEEN 156 AND 180 THEN 'd7'
            END
   );
