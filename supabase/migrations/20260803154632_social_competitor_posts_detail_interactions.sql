-- Le total d'interactions ne dit pas COMMENT une publication a marché. Un
-- contenu très partagé et un contenu très commenté n'appellent pas la même
-- lecture — c'est d'ailleurs pourquoi le partage pèse 30 % du score interne.
--
-- `shares` reste NULL côté Instagram : l'API ne l'expose pas pour les comptes
-- concurrents. Vérifié au chargement, côté Instagram
-- interactions = likes + comments exactement.

ALTER TABLE public.social_competitor_posts
  ADD COLUMN IF NOT EXISTS likes    integer,
  ADD COLUMN IF NOT EXISTS comments integer,
  ADD COLUMN IF NOT EXISTS shares   integer;

-- Facebook : la décomposition était déjà captée dans `raw`, on la remonte en
-- colonnes sans refaire d'appel à Metricool. Metricool sérialise ces compteurs
-- en décimal (« 168.0 ») : il faut passer par numeric avant l'entier.
UPDATE public.social_competitor_posts
   SET likes    = round(NULLIF(raw->>'reactions', '')::numeric)::integer,
       comments = round(NULLIF(raw->>'comments',  '')::numeric)::integer,
       shares   = round(NULLIF(raw->>'shares',    '')::numeric)::integer
 WHERE network = 'facebook'
   AND likes IS NULL
   AND raw ? 'reactions';
