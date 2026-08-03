-- Les Reels sont l'exception, pas la règle : seul le connecteur « competitor
-- reels » produit du REEL, et il l'écrit explicitement. Un défaut à POST évite
-- qu'une ligne insérée sans la colonne se retrouve sans format du tout — ce
-- qui est arrivé aux lignes chargées pendant que la colonne était ajoutée.

ALTER TABLE public.social_competitor_posts
  ALTER COLUMN media_type SET DEFAULT 'POST';

UPDATE public.social_competitor_posts
   SET media_type = 'POST'
 WHERE media_type IS NULL;
