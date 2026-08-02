-- ============================================================================
-- Attribution : de la publication au rendez-vous
--
-- Rien à construire côté capture : gohighlevel-sync extrait déjà utm_source,
-- utm_campaign et utm_content de la première attribution de chaque contact, et
-- Meta Ads s'en sert en production depuis des mois. Il manquait seulement de
-- poser un code sur nos publications organiques.
--
-- Convention : 'neo-142'. Le préfixe évite toute collision avec les valeurs
-- libres qu'utilisent les campagnes payantes (« 3 astuces », « Tu es une
-- femme »…).
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.social_tracking_seq START 101;

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS tracking_code text UNIQUE,
  -- Instagram n'autorise aucun lien cliquable sous un Reel. Le mot-clé de
  -- commentaire est le seul chemin traçable : un mot par publication, et la
  -- réponse automatique envoie le lien portant son code.
  ADD COLUMN IF NOT EXISTS dm_keyword text;

UPDATE public.social_posts
   SET tracking_code = 'neo-' || nextval('public.social_tracking_seq')
 WHERE tracking_code IS NULL;

ALTER TABLE public.social_posts
  ALTER COLUMN tracking_code SET DEFAULT ('neo-' || nextval('public.social_tracking_seq'));

-- ── Agrégat par publication ─────────────────────────────────────────────────
-- Fonction plutôt que vue : les tables ghl_* ne sont pas ouvertes au module
-- Réseaux sociaux, et une vue les exposerait à tout utilisateur authentifié.
-- Ici le garde-fou est explicite et ne renvoie que des totaux, jamais un
-- contact nominatif.
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
    count(DISTINCT c.ghl_id)                                          AS contacts,
    count(DISTINCT a.contact_id)                                      AS rdv_pris,
    count(DISTINCT a.contact_id) FILTER (WHERE a.status = 'showed')   AS rdv_honores,
    count(DISTINCT a.contact_id) FILTER (WHERE a.status = 'noshow')   AS rdv_noshow,
    count(DISTINCT o.ghl_id)     FILTER (WHERE o.status = 'won')      AS ventes,
    coalesce(sum(o.monetary_value) FILTER (WHERE o.status = 'won'), 0) AS valeur
  FROM public.social_posts p
  -- Le rapprochement se fait sur le code, pas sur une heuristique de date :
  -- soit le lien portait le code, soit l'attribution n'existe pas.
  LEFT JOIN public.ghl_contacts c      ON c.utm_content = p.tracking_code
  LEFT JOIN public.ghl_appointments a  ON a.contact_id = c.ghl_id
  LEFT JOIN public.ghl_opportunities o ON o.contact_id = c.ghl_id
  WHERE public.has_social_access()
  GROUP BY p.id, p.tracking_code
$$;

REVOKE ALL ON FUNCTION public.social_attribution() FROM public;
GRANT EXECUTE ON FUNCTION public.social_attribution() TO authenticated;

COMMENT ON FUNCTION public.social_attribution() IS
  'Totaux d''attribution par contenu du pipeline : contacts créés, rendez-vous '
  'pris, honorés, no-show, ventes et valeur. Rapprochement par '
  'ghl_contacts.utm_content = social_posts.tracking_code. Attribution au '
  'PREMIER contact : un contact déjà connu de GHL n''est jamais réattribué.';
