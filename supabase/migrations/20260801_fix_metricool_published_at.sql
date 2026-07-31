-- ── Correction du backfill Metricool (tâche 3) ──────────────────
--
-- Le backfill a écrit les `published_at` en heure LOCALE (America/Toronto,
-- EDT = UTC-4) en les étiquetant UTC. Confirmé par le premier run de
-- social-sync-meta : les 30 lignes 'metricool' sont décalées de
-- exactement +4 h par rapport au `timestamp` du Graph API, secondes
-- identiques, bijection parfaite 30 ↔ 30.
--
-- Conséquence : `publish_hour` / `publish_dow` (colonnes générées) étaient
-- faux de 4 h — soit précisément les axes du moteur d'analyse.
--
-- On canonise sur le Graph API (source la plus fiable) :
--   - les 30 doublons 'meta_direct' créés par le premier run sont supprimés
--     (leurs snapshots partent en cascade ; les insights Instagram sont
--     "lifetime", ils seront recréés à l'identique au run suivant) ;
--   - les 30 lignes 'metricool' récupèrent l'id Graph, le vrai published_at
--     et les métadonnées Graph. Leurs snapshots backfillés sont conservés.
--
-- Le matching se fait sur un écart multiple exact d'une heure (< 6 h),
-- signature d'un décalage de fuseau — pas sur une simple proximité.

DO $$
DECLARE
  n_pairs int;
BEGIN
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT m.id                AS m_id,
         g.id                AS g_id,
         g.platform_post_id  AS graph_post_id,
         g.published_at      AS graph_published_at,
         g.permalink         AS graph_permalink,
         g.media_type        AS graph_media_type,
         g.caption           AS graph_caption
  FROM public.social_publications m
  JOIN LATERAL (
    SELECT g2.* FROM public.social_publications g2
    WHERE g2.source = 'meta_direct'
      AND g2.account_id = m.account_id
      AND abs(extract(epoch FROM (g2.published_at - m.published_at))) <= 6 * 3600
      AND mod(abs(extract(epoch FROM (g2.published_at - m.published_at)))::int, 3600) <= 90
    ORDER BY abs(extract(epoch FROM (g2.published_at - m.published_at)))
    LIMIT 1
  ) g ON true
  WHERE m.source = 'metricool';

  SELECT count(*) INTO n_pairs FROM _pairs;

  -- Garde-fou : un id Graph ne doit servir qu'une fois.
  IF n_pairs <> (SELECT count(DISTINCT g_id) FROM _pairs) THEN
    RAISE EXCEPTION 'Réconciliation ambiguë : % paires pour % ids Graph distincts',
      n_pairs, (SELECT count(DISTINCT g_id) FROM _pairs);
  END IF;

  DELETE FROM public.social_publications WHERE id IN (SELECT g_id FROM _pairs);

  UPDATE public.social_publications m
  SET platform_post_id = p.graph_post_id,
      published_at     = p.graph_published_at,
      permalink        = COALESCE(p.graph_permalink, m.permalink),
      media_type       = COALESCE(p.graph_media_type, m.media_type),
      caption          = COALESCE(p.graph_caption, m.caption),
      is_final         = (now() - p.graph_published_at) > interval '72 hours'
  FROM _pairs p
  WHERE m.id = p.m_id;

  RAISE NOTICE '% publications réconciliées', n_pairs;
END $$;
