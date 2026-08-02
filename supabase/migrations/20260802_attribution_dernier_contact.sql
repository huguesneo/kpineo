-- ============================================================================
-- Attribution au dernier contact + parcours vérifiable
--
-- Le boni de prise de rendez-vous dépend de ces chiffres. Deux conséquences :
-- la règle doit être écrite noir sur blanc, et chaque rendez-vous attribué doit
-- pouvoir être ouvert et vérifié ligne par ligne. D'où le parcours détaillé
-- plutôt qu'un simple total.
--
-- Règle retenue : DERNIER point de contact avant la réservation. C'est celui
-- qui a déclenché l'action. Le premier reste stocké pour pouvoir comparer.
--
-- Limite de la source : GHL ne date pas ses points de contact. On ne peut donc
-- pas mesurer le délai entre le premier clic et le dernier — seulement entre
-- la création du contact et la réservation, ce qui répond à « elle a vu le Reel
-- il y a trois semaines, elle a réservé hier ».
-- ============================================================================

ALTER TABLE public.ghl_contacts
  ADD COLUMN IF NOT EXISTS utm_source_last   text,
  ADD COLUMN IF NOT EXISTS utm_medium_last   text,
  ADD COLUMN IF NOT EXISTS utm_campaign_last text,
  ADD COLUMN IF NOT EXISTS utm_content_last  text,
  ADD COLUMN IF NOT EXISTS first_page_url    text,
  ADD COLUMN IF NOT EXISTS last_page_url     text,
  ADD COLUMN IF NOT EXISTS first_referrer    text,
  ADD COLUMN IF NOT EXISTS touch_count       integer;

-- Backfill depuis le champ brut : la donnée dort déjà là, inutile d'attendre
-- le prochain passage du sync.
WITH t AS (
  SELECT
    c.id,
    jsonb_array_length(coalesce(c.raw->'attributions', '[]'::jsonb)) AS n,
    -- isLast n'est pas toujours posé : on retombe alors sur le dernier élément
    -- du tableau, que GHL renvoie dans l'ordre chronologique.
    coalesce(
      (SELECT a FROM jsonb_array_elements(c.raw->'attributions') a WHERE (a->>'isLast')::boolean IS TRUE LIMIT 1),
      (c.raw->'attributions') -> (jsonb_array_length(c.raw->'attributions') - 1)
    ) AS last_touch,
    coalesce(
      (SELECT a FROM jsonb_array_elements(c.raw->'attributions') a WHERE (a->>'isFirst')::boolean IS TRUE LIMIT 1),
      (c.raw->'attributions') -> 0
    ) AS first_touch
  FROM public.ghl_contacts c
  WHERE c.raw ? 'attributions'
)
UPDATE public.ghl_contacts c
   SET utm_source_last   = nullif(t.last_touch->>'utmSource', ''),
       utm_medium_last   = nullif(t.last_touch->>'utmMedium', ''),
       utm_campaign_last = nullif(t.last_touch->>'utmCampaign', ''),
       utm_content_last  = nullif(t.last_touch->>'utmContent', ''),
       last_page_url     = nullif(t.last_touch->>'url', ''),
       first_page_url    = nullif(t.first_touch->>'url', ''),
       first_referrer    = nullif(t.first_touch->>'referrer', ''),
       touch_count       = t.n
  FROM t
 WHERE t.id = c.id;

CREATE INDEX IF NOT EXISTS ghl_contacts_utm_content_last_idx
  ON public.ghl_contacts (utm_content_last) WHERE utm_content_last IS NOT NULL;

-- ── Totaux par contenu, au dernier contact ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.social_attribution()
RETURNS TABLE (
  post_id       uuid,
  tracking_code text,
  contacts      bigint,
  rdv_pris      bigint,
  rdv_honores   bigint,
  rdv_noshow    bigint,
  ventes        bigint,
  valeur        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.tracking_code,
    count(DISTINCT c.ghl_id),
    count(DISTINCT a.contact_id),
    count(DISTINCT a.contact_id) FILTER (WHERE a.status = 'showed'),
    count(DISTINCT a.contact_id) FILTER (WHERE a.status = 'noshow'),
    count(DISTINCT o.ghl_id)     FILTER (WHERE o.status = 'won'),
    coalesce(sum(o.monetary_value) FILTER (WHERE o.status = 'won'), 0)
  FROM public.social_posts p
  LEFT JOIN public.ghl_contacts c      ON c.utm_content_last = p.tracking_code
  LEFT JOIN public.ghl_appointments a  ON a.contact_id = c.ghl_id
  LEFT JOIN public.ghl_opportunities o ON o.contact_id = c.ghl_id
  WHERE public.has_social_access()
  GROUP BY p.id, p.tracking_code
$$;

-- ── Le parcours, contact par contact ────────────────────────────────────────
-- C'est la pièce qui rend le boni vérifiable : on voit qui, venu d'où, arrivé
-- quand, revenu par quelle porte, et combien de jours se sont écoulés.
CREATE OR REPLACE FUNCTION public.social_attribution_parcours(p_tracking_code text)
RETURNS TABLE (
  contact_id      text,
  nom             text,
  cree_le         timestamptz,
  premiere_source text,
  premier_lien    text,
  referent        text,
  derniere_source text,
  dernier_lien    text,
  touches         integer,
  meme_source     boolean,
  rdv_le          timestamptz,
  rdv_statut      text,
  delai_jours     numeric,
  vente           boolean,
  valeur          numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.ghl_id,
    trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
    c.created_at_ghl,
    nullif(c.utm_source, ''),
    c.first_page_url,
    c.first_referrer,
    c.utm_source_last,
    c.last_page_url,
    c.touch_count,
    -- Vrai quand le premier et le dernier contact portent le même code : la
    -- publication a fait découvrir ET déclenché. Le cas le moins discutable.
    nullif(c.utm_content, '') IS NOT DISTINCT FROM c.utm_content_last,
    a.start_time,
    a.status,
    CASE WHEN a.start_time IS NOT NULL
         THEN round(extract(epoch FROM (a.start_time - c.created_at_ghl)) / 86400.0, 1) END,
    o.status = 'won',
    o.monetary_value
  FROM public.ghl_contacts c
  LEFT JOIN LATERAL (
    SELECT * FROM public.ghl_appointments x
     WHERE x.contact_id = c.ghl_id ORDER BY x.start_time LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.ghl_opportunities y
     WHERE y.contact_id = c.ghl_id ORDER BY y.created_at_ghl DESC LIMIT 1
  ) o ON true
  WHERE public.has_social_access()
    AND c.utm_content_last = p_tracking_code
  ORDER BY a.start_time DESC NULLS LAST, c.created_at_ghl DESC
$$;

REVOKE ALL ON FUNCTION public.social_attribution_parcours(text) FROM public;
GRANT EXECUTE ON FUNCTION public.social_attribution_parcours(text) TO authenticated;

COMMENT ON FUNCTION public.social_attribution_parcours(text) IS
  'Parcours détaillé des contacts attribués à un contenu, pour vérification du '
  'boni de prise de rendez-vous. Attribution au dernier point de contact. '
  'meme_source indique que le premier et le dernier contact portent le même '
  'code — le cas le moins discutable.';
