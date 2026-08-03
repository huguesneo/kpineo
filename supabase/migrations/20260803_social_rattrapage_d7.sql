-- ============================================================================
-- Rattrapage des publications tombées dans le trou J+7,5 → J+27
--
-- windowTag() n'étiquetait un relevé d7 qu'entre 156 h et 180 h après la
-- publication, et un d28 qu'à partir de 648 h. Entre les deux : rien. Une
-- publication qui rate sa fenêtre d7 n'est donc scorable qu'à J+27.
--
-- Les publications du 9 au 24 juillet l'ont toutes ratée pour la même raison :
-- le sync Meta n'a démarré que le 31 juillet, elles avaient déjà dépassé 180 h
-- à son premier passage. D'où 27 publications affichées « en attente de
-- relevé » dans l'analyse, dont 16 ne le seraient plus jamais avant J+27.
--
-- On promeut donc, pour chaque publication concernée, UN relevé au rang de d7.
-- Choix du relevé : le plus proche de la fenêtre réelle (age_hours le plus
-- faible au-delà de 180 h), parce que c'est le moins gonflé — un relevé pris à
-- J+22 cumule quinze jours d'engagement de plus qu'un vrai J+7. On exige aussi
-- un dénominateur exploitable, sinon le moteur de score écarte la ligne et le
-- rattrapage n'aurait servi à rien.
--
-- is_late_measure = true dans tous les cas : ce n'est pas une mesure faite dans
-- la fenêtre, et l'écran doit le dire. Le pendant côté code vit dans
-- windowFor() (social-sync-meta), qui applique la même règle aux futurs relevés.
--
-- Effet attendu à court terme : ces publications passent de « en attente de
-- relevé » à « insuffisant ». L'univers d7 ne compte encore que 17 relevés et
-- BASELINE_MIN vaut 8 par bucket — le verdict ne devient conclusif qu'à mesure
-- que les publications suivantes traversent leur fenêtre d7 normalement. C'est
-- voulu : mieux vaut « pas assez d'historique » qu'un score inventé.
-- ============================================================================

WITH candidat AS (
  SELECT DISTINCT ON (s.publication_id) s.id, s.publication_id
    FROM public.social_metric_snapshots s
    JOIN public.social_publications p ON p.id = s.publication_id
   WHERE s.window_tag IS NULL
     AND s.age_hours > 180
     -- Sans portée ni vues, computeWindow() écarte la ligne (skipped_no_denominator).
     AND (COALESCE(s.reach, 0) > 0 OR COALESCE(s.views, 0) > 0)
     -- Uniquement les publications qu'aucune fenêtre scorable ne couvre déjà.
     AND NOT EXISTS (
       SELECT 1 FROM public.social_metric_snapshots x
        WHERE x.publication_id = p.id
          AND x.window_tag IN ('d7', 'd28')
     )
   ORDER BY s.publication_id, s.age_hours ASC
)
UPDATE public.social_metric_snapshots s
   SET window_tag = 'd7',
       is_late_measure = true
  FROM candidat c
 WHERE s.id = c.id;

COMMENT ON COLUMN public.social_metric_snapshots.is_late_measure IS
  'Relevé pris nettement après la fenêtre qu''il documente (au-delà de la borne '
  'haute de cette fenêtre : 180 h pour d7, 720 h pour d28). La valeur est '
  'cumulée depuis la publication, donc supérieure à ce qu''aurait donné une '
  'mesure faite dans la fenêtre. Le score reste un ordre de grandeur.';
