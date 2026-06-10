-- =============================================================================
-- Accès naturo au module Performance & REER (étape 1 : lecture seule)
-- Calcul publié côté admin → instantané par naturo. Le naturo ne lit QUE ses
-- propres résultats (jamais les revenus/salaires des collègues).
-- =============================================================================

-- 1) Lien entre un compte (profile) et un naturo du module
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS perf_naturo_key text
  CHECK (perf_naturo_key IS NULL OR perf_naturo_key IN ('thibault','brice','jessica','tamara'));

-- 2) Toggle d'affichage du REER par naturo (contrôlé par l'admin)
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_visible_thibault boolean DEFAULT false;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_visible_brice    boolean DEFAULT false;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_visible_jessica  boolean DEFAULT false;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_visible_tamara   boolean DEFAULT false;

-- 3) Helper : clé naturo du compte connecté (SECURITY DEFINER pour éviter la récursion RLS)
CREATE OR REPLACE FUNCTION public.my_naturo_key()
RETURNS text AS $$
  SELECT perf_naturo_key FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4) Instantané mensuel par naturo (résultats déjà calculés, lisibles par le naturo)
CREATE TABLE IF NOT EXISTS public.neo_naturo_monthly (
  id uuid primary key default gen_random_uuid(),
  naturo_key text not null check (naturo_key in ('thibault','brice','jessica','tamara')),
  year integer not null,
  month integer not null check (month between 1 and 12),
  visible boolean not null default false,
  -- Chiffres compagnie (partagés avec le naturo)
  profit_neo numeric(12,2),
  depenses_total numeric(12,2),
  plancher numeric(12,2),
  plancher_atteint boolean,
  -- Chiffres individuels du naturo
  own_revenue numeric(12,2),
  own_profit numeric(12,2),
  own_marge numeric(7,2),
  marge_seuil numeric(5,2),
  marge_ok boolean,
  -- REER
  montant_naturo numeric(12,2) default 0,
  proof_path text,
  montant_neo numeric(12,2) default 0,
  eligible boolean default false,
  published_at timestamptz default now(),
  unique(naturo_key, year, month)
);

ALTER TABLE public.neo_naturo_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hugues gère les instantanés naturo" ON public.neo_naturo_monthly;
CREATE POLICY "Hugues gère les instantanés naturo" ON public.neo_naturo_monthly
  FOR ALL USING (public.is_hugues()) WITH CHECK (public.is_hugues());

DROP POLICY IF EXISTS "Naturo lit son instantané visible" ON public.neo_naturo_monthly;
CREATE POLICY "Naturo lit son instantané visible" ON public.neo_naturo_monthly
  FOR SELECT USING (visible = true AND naturo_key = public.my_naturo_key());
