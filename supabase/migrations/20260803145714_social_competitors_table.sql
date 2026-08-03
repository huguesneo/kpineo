-- Registre des comptes concurrents suivis dans Metricool.
--
-- Un instantané par compte et par jour : Metricool ne conserve pas
-- d'historique de ces indicateurs, et sans relevé quotidien on ne pourrait
-- jamais dire comment un concurrent a évolué.
--
-- La clé d'identité est (network, competitor_id) et non le seul nom : les
-- comptes suivis côté Instagram et côté Facebook sont des comptes différents.

CREATE TABLE IF NOT EXISTS public.social_competitors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network          text NOT NULL,
  competitor_id    text NOT NULL,       -- identifiant du compte côté Metricool
  screen_name      text NOT NULL,
  display_name     text,
  picture_url      text,
  followers        integer,
  posts_count      integer,
  avg_likes        numeric,             -- j'aime (IG) / réactions (FB) moyens
  avg_engagement   numeric,
  snapshot_date    date NOT NULL,
  raw              jsonb NOT NULL,
  UNIQUE (network, competitor_id, snapshot_date)
);

ALTER TABLE public.social_competitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_competitors_all ON public.social_competitors;
CREATE POLICY social_competitors_all ON public.social_competitors
  FOR ALL
  USING (public.has_social_access())
  WITH CHECK (public.has_social_access());
