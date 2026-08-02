-- ============================================================================
-- Démographie de l'audience + comptes TikTok et Google
--
-- Meta ne donne la démographie qu'au niveau du compte, jamais par publication.
-- On stocke donc un instantané daté par compte et par dimension, en format
-- long (une ligne par tranche) plutôt qu'en jsonb : ça se filtre, ça s'agrège
-- et ça se compare dans le temps sans désérialiser.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.social_audience_snapshots (
  id            bigserial PRIMARY KEY,
  account_id    uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  dimension     text NOT NULL CHECK (dimension IN ('age_gender','country')),
  -- age_gender : '35-44|F' (F, M, U comme chez Meta). country : 'Canada'.
  bucket        text NOT NULL,
  value         integer NOT NULL,
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, snapshot_date, dimension, bucket)
);

CREATE INDEX IF NOT EXISTS social_audience_account_date_idx
  ON public.social_audience_snapshots (account_id, snapshot_date DESC);

ALTER TABLE public.social_audience_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_audience_snapshots_all ON public.social_audience_snapshots;
CREATE POLICY social_audience_snapshots_all ON public.social_audience_snapshots
  FOR ALL
  USING (public.has_social_access())
  WITH CHECK (public.has_social_access());

-- ── Comptes manquants ───────────────────────────────────────────────────────
-- TikTok : open_id du compte business, confirmé via GHL social-media-posting
-- accounts (platform=tiktok, originId).
-- Google : identifiant de fiche GBP, même source (locations/…).
INSERT INTO public.social_accounts
  (platform, external_id, handle, display_name, timezone, is_active)
VALUES
  ('tiktok', '000VNNs9LaE5w8WReSDBoGVvTumB8FysFH8', 'neoperformance', 'NEOPERFORMANCE', 'America/Toronto', true),
  ('google', '1164688327611476272', 'neoperformance', 'NEO Performance', 'America/Toronto', false)
ON CONFLICT (platform, external_id) DO NOTHING;

-- La fiche Google entre inactive : GHL rapporte hasStatisticsPermissions=false
-- et son jeton a expiré le 2026-08-01. Rien à synchroniser tant que ce n'est
-- pas reconnecté — la ligne existe pour que les publications Google puissent
-- s'y rattacher le jour venu.

-- ── Identifiant de marque Metricool ─────────────────────────────────────────
-- metricool_blog_id existe déjà sur la table ; on y pose le brandId commun aux
-- trois réseaux synchronisés depuis Metricool.
UPDATE public.social_accounts
   SET metricool_blog_id = 6648608
 WHERE platform IN ('instagram','facebook','tiktok')
   AND metricool_blog_id IS DISTINCT FROM 6648608;
