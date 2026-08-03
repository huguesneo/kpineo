-- Metricool sépare les publications du fil et les Reels dans deux connecteurs
-- distincts. Sans cette colonne, un compte qui ne publie que des Reels
-- apparaît vide, et on ne peut pas dire quel format perce chez un concurrent.
--
-- Constaté au 2026-08-03 : trainbloom (0 post, 23 Reels) et ben.nutritionniste
-- (0 post, 64 Reels) étaient entièrement invisibles avant ce correctif.

ALTER TABLE public.social_competitor_posts
  ADD COLUMN IF NOT EXISTS media_type text;

-- Tout ce qui était déjà chargé venait du connecteur « competitor posts ».
UPDATE public.social_competitor_posts
   SET media_type = 'POST'
 WHERE media_type IS NULL;
